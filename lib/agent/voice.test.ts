import { describe, expect, it } from 'vitest';
import type { AgentModel, ModelRequest } from './model';
import { transcribeAudio, wavPeakRms } from './voice';

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

describe('deteksi sunyi di server', () => {
  const wav = (amp: number) => {
    const n = 16000;
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.write('WAVE', 8); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt16LE(16, 34);
    // 0,9 detik sunyi lalu 0,1 detik bersuara: puncak per jendela tetap terdeteksi
    for (let i = Math.round(n * 0.9); i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 3) * amp * 32767), 44 + i * 2);
    return b;
  };
  it('wavPeakRms: sunyi ≈ 0, ucapan pendek tetap terdeteksi, bukan WAV = null', () => {
    expect(wavPeakRms(wav(0))).toBe(0);
    expect(wavPeakRms(wav(0.3))!).toBeGreaterThan(0.1);
    expect(wavPeakRms(Buffer.from('bukan wav'))).toBeNull();
  });
  it('rekaman sunyi tidak dikirim ke model', async () => {
    const { model, reqs } = fake('{"transcript":"Catat ya, beli kopi 25rb.","clear":true}');
    expect(await transcribeAudio(model, { data: wav(0), mime: 'audio/wav' })).toBeNull();
    expect(reqs).toHaveLength(0);
    expect(await transcribeAudio(model, { data: wav(0.3), mime: 'audio/wav' })).toBe('Catat ya, beli kopi 25rb.');
  });
});
