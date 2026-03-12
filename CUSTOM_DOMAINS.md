# Guia de Configuração: Domínios Personalizados no Byfrost

Este guia explica como conectar domínios próprios (ex: `meusite.com`) às páginas criadas no Portal Byfrost.

## 1. Configuração de DNS (Para o Cliente/Usuário)

O cliente que comprou o domínio deve configurar os registros DNS no painel da registradora (GoDaddy, Registro.br, Cloudflare, etc).

### Opção A: Usando um Subdomínio (Recomendado)
*Exemplo: `portal.empresa.com`*

| Tipo | Nome | Valor |
| :--- | :--- | :--- |
| **CNAME** | `portal` | `cname.vercel-dns.com` |

### Opção B: Usando o Domínio Raiz (Apex)
*Exemplo: `empresa.com`*

| Tipo | Nome | Valor |
| :--- | :--- | :--- |
| **A** | `@` | `76.76.21.21` |

---

## 2. Configuração no Vercel (Para o Administrador Byfrost)

Para que o Vercel aceite as conexões desses domínios, você precisa registrá-los no seu projeto.

### Via Painel Vercel (Manual)
1. Vá em **Project Settings** > **Domains**.
2. Adicione o domínio do cliente.
3. O Vercel verificará o DNS e emitirá o certificado SSL automaticamente.

### Via API (Automático/Escalável)
Se você tiver muitos clientes, pode automatizar isso usando a API do Vercel sempre que um usuário salvar um novo domínio no Byfrost:
`POST https://api.vercel.com/v10/projects/[PROJECT_ID]/domains?teamId=[TEAM_ID]`

---

## 3. Como funciona a Identificação

1. O usuário acessa `https://portal.empresa.com`.
2. O Byfrost (Front-end) detecta que o host atual é `portal.empresa.com`.
3. O sistema faz uma busca no banco de dados:
   ```sql
   SELECT * FROM portal_pages 
   WHERE page_settings->>'custom_domain' = 'portal.empresa.com'
   LIMIT 1;
   ```
4. Se encontrar, carrega o conteúdo da página imediatamente, independentemente do slug na URL.

---

## 4. Dicas Importantes
- **SSL**: O Vercel gerencia o HTTPS automaticamente após o apontamento do DNS.
- **Propagação**: Alterações de DNS podem levar de alguns minutos a 24 horas.
- **Redirecionamento**: Recomendamos sempre configurar o `www` para redirecionar para o domínio principal ou vice-versa.
