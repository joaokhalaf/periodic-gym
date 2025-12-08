import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

export interface VideoAnalysisResult {
  summary: string;
  repCount: number;
  formIssues: string[];
  strengths: string[];
  recommendations: string[];
  overallScore: number;
}

// Configuração para aumentar limite de tamanho
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Configuração do servidor incompleta. Contate o suporte.' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const exercise = formData.get('exercise') as string | null;
    const detectedReps = formData.get('detectedReps') as string | null;
    const avgQuality = formData.get('avgQuality') as string | null;
    const framesJson = formData.get('frames') as string | null;
    const videoFile = formData.get('video') as File | null;

    if (!exercise) {
      return NextResponse.json(
        { error: 'Exercício é obrigatório.' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `
Você é um personal trainer especializado em análise biomecânica de exercícios físicos.

**Exercício analisado:** ${exercise}
${detectedReps ? `**Repetições detectadas pelo sistema:** ${detectedReps}` : ''}
${avgQuality ? `**Qualidade média detectada:** ${avgQuality}%` : ''}

Analise as imagens sequenciais da execução do exercício e forneça uma avaliação DETALHADA e PROFISSIONAL seguindo este formato JSON:

{
  "summary": "Resumo geral da execução (2-3 frases)",
  "repCount": número_total_de_repetições_válidas,
  "formIssues": [
    "Problema 1 identificado",
    "Problema 2 identificado"
  ],
  "strengths": [
    "Ponto forte 1",
    "Ponto forte 2"
  ],
  "recommendations": [
    "Recomendação específica 1",
    "Recomendação específica 2"
  ],
  "overallScore": nota_de_0_a_100
}

**Critérios de avaliação:**
1. **Alinhamento postural** - Posição da coluna, ombros, quadril
2. **Amplitude de movimento** - Se o movimento é completo e controlado
3. **Controle e estabilidade** - Ausência de compensações e tremores excessivos
4. **Velocidade de execução** - Cadência apropriada (não muito rápido/lento)
5. **Simetria** - Equilíbrio entre lados do corpo

**IMPORTANTE:**
- Seja objetivo e construtivo
- Retorne APENAS o JSON, sem texto adicional
`;

    let contentParts: any[] = [];

    // Preferir frames (mais leve) sobre vídeo completo
    if (framesJson) {
      const frames: string[] = JSON.parse(framesJson);
      contentParts = frames.map(frame => ({
        inlineData: {
          data: frame,
          mimeType: 'image/jpeg'
        }
      }));
    } else if (videoFile) {
      // Fallback para vídeo se não houver frames
      const arrayBuffer = await videoFile.arrayBuffer();
      const base64Video = Buffer.from(arrayBuffer).toString('base64');
      contentParts = [{
        inlineData: {
          data: base64Video,
          mimeType: videoFile.type || 'video/webm'
        }
      }];
    } else {
      return NextResponse.json(
        { error: 'Vídeo ou frames são obrigatórios.' },
        { status: 400 }
      );
    }

    contentParts.push(prompt);

    const result = await model.generateContent(contentParts);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Não foi possível processar a análise. Tente novamente.' },
        { status: 500 }
      );
    }

    const analysis: VideoAnalysisResult = JSON.parse(jsonMatch[0]);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Erro ao analisar vídeo:', error);
    return NextResponse.json(
      { error: 'Falha na análise do vídeo. Tente novamente mais tarde.' },
      { status: 500 }
    );
  }
}
