import { getSettingsDTO, updateSettings } from '@/lib/services/settings';

export async function GET() {
  try {
    const dto = await getSettingsDTO();
    return Response.json(dto);
  } catch (e) {
    console.error('Failed to load settings', e);
    return new Response('Failed to load settings', { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { openaiBaseUrl, openaiApiKey, postgresUrl } = body ?? {};
    await updateSettings({ openaiBaseUrl, openaiApiKey, postgresUrl });
    const dto = await getSettingsDTO();
    return Response.json(dto);
  } catch (e) {
    console.error('Failed to update settings', e);
    return new Response('Failed to update settings', { status: 500 });
  }
}


