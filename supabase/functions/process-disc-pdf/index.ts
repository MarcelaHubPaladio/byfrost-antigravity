import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";
import OpenAI from "https://esm.sh/openai@4.28.4";
import pdfParse from "npm:pdf-parse@1.1.1";
import { Buffer } from "node:buffer";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const formData = await req.formData();
    const file = formData.get('file');
    const tenantId = formData.get('tenantId');
    const userId = formData.get('userId');

    if (!file || !tenantId || !userId) {
      throw new Error("Missing required fields");
    }

    if (!(file instanceof File)) {
      throw new Error("File is not a valid file object");
    }

    // 1. Extrair o texto do PDF
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const pdfData = await pdfParse(buffer);
    const pdfText = pdfData.text;

    // 2. Chamar a OpenAI para extrair o perfil estruturado
    const openai = new OpenAI({
      apiKey: Deno.env.get("OPENAI_API_KEY"),
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você é um Diretor de Recursos Humanos e Psicólogo Organizacional especialista em testes DISC. 
Sua tarefa é analisar o texto bruto de um laudo DISC e extrair os dados em formato JSON estrito, contendo exatamente as seguintes chaves:
{
  "d": número (percentual de Dominância natural),
  "i": número (percentual de Influência natural),
  "s": número (percentual de Estabilidade natural),
  "c": número (percentual de Conformidade natural),
  "summary": string (um resumo conciso de 1 a 2 frases para o colaborador sobre seu perfil),
  "hr_analysis": {
    "strengths": [string, string, ...],
    "improvement_points": [string, string, ...],
    "communication_style": string,
    "ideal_environment": string,
    "decision_making": string,
    "leadership_potential": string
  }
}
Não inclua nenhuma outra chave. Certifique-se de extrair as porcentagens corretas do Perfil Natural ou Perfil Base (se não houver distinção, use o perfil principal).`
        },
        {
          role: "user",
          content: `Extraia o perfil DISC do seguinte texto de laudo:\n\n${pdfText.substring(0, 30000)}`
        }
      ]
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) throw new Error("Falha ao receber resposta da IA");
    
    const discProfile = JSON.parse(responseContent);

    // 3. Fazer upload do arquivo PDF para o Storage
    const fileName = `disc_${Date.now()}.pdf`;
    const filePath = `${tenantId}/${userId}/${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabaseClient
      .storage
      .from("employee_documents")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      // Podemos prosseguir mesmo sem o upload do arquivo se der erro, mas o ideal é registrar.
    }

    const newProfile = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      file_path: uploadError ? null : filePath,
      ...discProfile
    };

    // 4. Salvar no Supabase (Buscar o atual primeiro para fazer append)
    const { data: userData, error: fetchError } = await supabaseClient
      .from("users_profile")
      .select("disc_profile")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError) throw fetchError;

    let currentHistory = userData?.disc_profile;
    if (!Array.isArray(currentHistory)) {
        if (currentHistory && typeof currentHistory === 'object' && Object.keys(currentHistory).length > 0) {
            currentHistory = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...currentHistory }];
        } else {
            currentHistory = [];
        }
    }

    currentHistory.push(newProfile);

    const { error: updateError } = await supabaseClient
      .from("users_profile")
      .update({
        disc_profile: currentHistory
      })
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);

    if (updateError) {
      console.error("Database update error:", updateError);
      throw updateError;
    }

    return new Response(JSON.stringify({ success: true, profile: currentHistory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Error processing DISC PDF:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
