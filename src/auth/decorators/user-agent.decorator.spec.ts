import { Request } from 'express';
import { extractUserAgent } from './user-agent.decorator';

const requestWith = (userAgent?: string) =>
  ({ headers: userAgent === undefined ? {} : { 'user-agent': userAgent } }) as unknown as Request;

describe('extractUserAgent', () => {
  it('devolve o header como veio quando cabe no limite', () => {
    const chrome =
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127 Mobile Safari/537.36';

    expect(extractUserAgent(requestWith(chrome))).toBe(chrome);
  });

  /**
   * A coluna `Session.userAgent` é `String?` — sem limite no banco — e o valor é texto
   * arbitrário do cliente. O corte é o que impede uma requisição de gravar o que quiser.
   */
  it('trunca em 255 caracteres', () => {
    const resultado = extractUserAgent(requestWith('a'.repeat(1000)));

    expect(resultado).toHaveLength(255);
  });

  /**
   * O rótulo é opcional em toda a cadeia (`auth.service.ts` → `sessions.service.ts` → coluna
   * nullable): ausência não pode virar erro nem string vazia, ou uma chamada sem o header
   * deixaria de conseguir abrir sessão.
   */
  it.each([
    ['ausente', undefined],
    ['vazio', ''],
  ])('devolve null quando o header está %s', (_caso, valor) => {
    expect(extractUserAgent(requestWith(valor))).toBeNull();
  });
});
