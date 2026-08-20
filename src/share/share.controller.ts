import { Controller, Get, Header, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ShareService } from './share.service';

/**
 * Links compartilháveis de imóvel, com preview no WhatsApp.
 *
 * Existe porque o app é uma SPA: o `index.html` servido pela Vercel é o mesmo para toda
 * URL e não carrega meta tag nenhuma, e o crawler do WhatsApp não executa JavaScript —
 * então nada que o React renderize chega até ele. Estas rotas entregam o HTML com as
 * Open Graph tags já prontas e mandam o visitante para a SPA em seguida.
 *
 * Públicas de propósito: um crawler não tem cookie.
 */
@ApiTags('share')
@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  /**
   * Nada aqui pode lançar.
   *
   * O `AllExceptionsFilter` é global e termina em `response.json(...)` sem negociar
   * conteúdo, então qualquer exceção que escape vira **JSON** — o crawler não acha as OG
   * tags e o visitante encontra um objeto cru na tela. É pelo mesmo motivo que o `:id`
   * não passa por `ParseUUIDPipe`: um id malformado viraria `BadRequestException`. A
   * validação é o próprio caminho de fallback do serviço.
   *
   * Também não há `@Query()` declarado, e isso é intencional. O `ValidationPipe` global
   * roda com `forbidNonWhitelisted: true`, mas só valida parâmetro decorado — links
   * compartilhados chegam com `?fbclid=…` do próprio WhatsApp/Facebook, e sem `@Query()`
   * esses parâmetros são ignorados em vez de virarem 400. **Declarar um `@Query()` aqui
   * quebraria todo link já compartilhado.**
   */
  @Get('properties/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Página de compartilhamento de um imóvel',
    description:
      'Devolve HTML com as meta tags Open Graph do imóvel e redireciona para a SPA. ' +
      'Endpoint público, consumido pelos crawlers de WhatsApp, Facebook e afins. ' +
      'Um imóvel inexistente ou não publicado devolve 200 com um card genérico, nunca ' +
      'um erro — um 404 faria o WhatsApp não renderizar card nenhum.',
  })
  @ApiParam({ name: 'id', description: 'ID da propriedade' })
  @ApiResponse({ status: 200, description: 'HTML com as OG tags' })
  async shareProperty(@Param('id') id: string, @Req() req: Request): Promise<string> {
    // `req.protocol` respeita o X-Forwarded-Proto graças ao `trust proxy` de main.ts, então
    // em produção sai `https` mesmo com o TLS terminado pelo Fly. É daqui que sai a origem
    // absoluta do `og:image` — crawler não resolve caminho relativo com confiança.
    return this.shareService.buildSharePage(id, `${req.protocol}://${req.get('host') ?? ''}`);
  }

  /**
   * A imagem do card, redimensionada e com teto de bytes.
   *
   * Fora do Swagger porque devolve binário e não faz parte do contrato que o frontend
   * consome — quem busca esta URL é o crawler, a partir do `og:image` da página acima.
   *
   * `@Res({ passthrough: false })` porque a resposta é um Buffer com header próprio.
   * Cuidado ao mexer: combinar isto com `@CacheTTL` trava a requisição, já que num acerto
   * de cache o interceptor devolve o valor e nunca toca no objeto de resposta.
   */
  @Get('properties/:id/image.jpg')
  @ApiExcludeEndpoint()
  async shareImage(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const image = await this.shareService.buildOgImage(id);

    if (!image) {
      // O card já omite o `og:image` quando não há foto; este 404 cobre o crawler que
      // insistir na URL mesmo assim. Redirecionar para o original seria devolver os
      // ~350KB que esta rota existe para evitar.
      throw new NotFoundException('Imagem de compartilhamento indisponível');
    }

    res.setHeader('Content-Type', 'image/jpeg');
    // A URL é por imóvel e a capa muda raramente; o WhatsApp guarda a miniatura do lado
    // dele, então uma busca serve todas as visualizações da mensagem.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(image);
  }
}
