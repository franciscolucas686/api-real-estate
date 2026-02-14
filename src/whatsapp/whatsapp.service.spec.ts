import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';

jest.mock('../config/env.config', () => ({
  validateEnvConfig: jest.fn(() => ({
    WHATSAPP_A: '81999999999',
    WHATSAPP_B: '81888888888',
  })),
}));

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappService],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('getWhatsappNumber', () => {
    it('deve retornar um número de WhatsApp', () => {
      const propertyId = 'test-property-id';
      const number = service.getWhatsappNumber(propertyId);

      expect(number).toMatch(/^\d{11}$/);
      expect([
        service.getWhatsappNumbers().whatsappA,
        service.getWhatsappNumbers().whatsappB,
      ]).toContain(number);
    });

    it('deve retornar o mesmo número para o mesmo propertyId', () => {
      const propertyId = 'test-property-id';
      const number1 = service.getWhatsappNumber(propertyId);
      const number2 = service.getWhatsappNumber(propertyId);

      expect(number1).toBe(number2);
    });
  });

  describe('getWhatsappNumbers', () => {
    it('deve retornar ambos os números de WhatsApp', () => {
      const numbers = service.getWhatsappNumbers();

      expect(numbers).toHaveProperty('whatsappA');
      expect(numbers).toHaveProperty('whatsappB');
      expect(numbers.whatsappA).toBeDefined();
      expect(numbers.whatsappB).toBeDefined();
    });
  });
});
