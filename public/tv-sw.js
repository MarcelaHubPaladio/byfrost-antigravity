/**
 * TV Corporativa - Service Worker de Cache de Mídia
 *
 * Intercepta requests de vídeos e imagens do bucket Supabase `tv-corporativa-media`
 * e os armazena no Cache API do browser (em disco, não em RAM).
 *
 * Estratégia: Cache-First com suporte a Range Requests (necessário para streamming de vídeo).
 *   - 1ª reprodução: busca do CDN Supabase e cacheia
 *   - Próximas reproduções: serve do cache local (zero egress)
 */

const CACHE_NAME = 'tv-corporativa-v1';

/** Verifica se a URL é de mídia da TV corporativa que deve ser cacheada */
function shouldCache(url) {
    return url.includes('tv-corporativa-media');
}

// ─── Ciclo de vida do SW ────────────────────────────────────────────────────

self.addEventListener('install', () => {
    console.log('[TV-SW] Instalado. Versão:', CACHE_NAME);
    self.skipWaiting(); // Ativa imediatamente sem esperar tabs antigas fecharem
});

self.addEventListener('activate', event => {
    console.log('[TV-SW] Ativado. Limpando caches antigos...');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => {
                        console.log('[TV-SW] Removendo cache obsoleto:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => self.clients.claim()) // Assume controle de todas as tabs abertas
    );
});

// ─── Interceptação de Fetch ─────────────────────────────────────────────────

self.addEventListener('fetch', event => {
    // Apenas intercepta GET (leitura). Uploads (POST) devem passar direto.
    if (event.request.method !== 'GET') return;

    if (!shouldCache(event.request.url)) return; // Ignora requests que não são mídia TV
    event.respondWith(serveCached(event.request));
});

// ─── Lógica de Cache ────────────────────────────────────────────────────────

/**
 * Cache-First: tenta servir do cache, senão busca da rede e cacheia para próxima vez.
 * Suporta Range Requests que o browser envia ao fazer streaming de vídeo.
 */
async function serveCached(request) {
    const cache = await caches.open(CACHE_NAME);

    // Normaliza o request para sempre buscar o recurso completo (ignora Range header no cache lookup)
    const cleanRequest = new Request(request.url, { mode: 'cors', credentials: 'omit' });
    const rangeHeader = request.headers.get('Range');

    // 1. Tenta cache primeiro
    const cached = await cache.match(cleanRequest);
    if (cached) {
        console.log('[TV-SW] Cache HIT:', request.url.split('/').pop());
        if (rangeHeader) {
            return buildRangeResponse(cached.clone(), rangeHeader);
        }
        return cached;
    }

    // 2. Cache MISS — busca da rede
    console.log('[TV-SW] Cache MISS, buscando da rede:', request.url.split('/').pop());
    try {
        const networkResponse = await fetch(cleanRequest);

        if (networkResponse.ok) {
            // Cacheia o recurso completo em background (não bloqueia a resposta)
            const forCache = networkResponse.clone();
            cache.put(cleanRequest, forCache).then(() => {
                console.log('[TV-SW] Cacheado com sucesso:', request.url.split('/').pop());
            });

            // Serve o range correto se o browser pediu
            if (rangeHeader) {
                return buildRangeResponse(networkResponse.clone(), rangeHeader);
            }
            return networkResponse;
        }

        return networkResponse;
    } catch (err) {
        // Falha de rede — última tentativa direto
        console.warn('[TV-SW] Erro de rede, tentando request direto:', err);
        return fetch(request);
    }
}

/**
 * Constrói uma resposta 206 Partial Content a partir de um Response completo cacheado.
 * Necessário porque o browser envia Range Requests ao fazer streaming de vídeo.
 *
 * @param {Response} response - Response completo do cache
 * @param {string} rangeHeader - Valor do header Range (ex: "bytes=0-1048575")
 */
async function buildRangeResponse(response, rangeHeader) {
    const buffer = await response.arrayBuffer();
    const total = buffer.byteLength;

    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (!match) {
        // Range inválido, retorna o arquivo completo
        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
                'Content-Length': String(total),
                'Accept-Ranges': 'bytes',
            }
        });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : total - 1;
    const clampedEnd = Math.min(end, total - 1);
    const chunk = buffer.slice(start, clampedEnd + 1);

    return new Response(chunk, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
            'Content-Range': `bytes ${start}-${clampedEnd}/${total}`,
            'Content-Length': String(clampedEnd - start + 1),
            'Accept-Ranges': 'bytes',
        }
    });
}
