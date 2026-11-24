import { describe, expect, it } from 'vitest';
import type { AgentModel, ModelRequest } from './model';
import { transcribeAudio } from './voice';

const fake = (text: string) => {
  const reqs: ModelRequest[] = [];
  const model: AgentModel = { name: 'f', generate: async (r) => { reqs.push(r); return { content: { role: 'model', parts: [{ text }] }, functionCalls: [], text }; } };
  return { model, reqs };
};
const audio = { data: Buffer.from('RIFFuji'), mime: 'audio/wav' };

describe('transcribeAudio', () => {
  it('satu panggilan ringan: audio inline, tanpa tool, JSON, berpikir minimal', async () => {
    const { model, reqs } = fake('{"transcript":"  tadi beli bensin 30rb\\n pakai gopay ","clear":true}');
    expect(await transcribeAudio(model, audio)).toBe('tadi beli bensin 30rb pakai gopay');
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ tools: [], thinking: 'minimal' });
    expect(reqs[0].json).toBeTruthy();
    expect(reqs[0].contents[0].parts?.[0].inlineData).toEqual({ mimeType: 'audio/wav', data: audio.data.toString('base64') });
  });
  it('tidak jelas atau kosong → null', async () => {
    expect(await transcribeAudio(fake('{"transcript":"","clear":false}').model, audio)).toBeNull();
    expect(await transcribeAudio(fake('{"transcript":"hmm","clear":false}').model, audio)).toBeNull();
  });
  it('model menjawab teks biasa: dipakai apa adanya', async () => {
    expect(await transcribeAudio(fake('sisa uang berapa').model, audio)).toBe('sisa uang berapa');
  });
});
