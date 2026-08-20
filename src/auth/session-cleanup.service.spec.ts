import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SessionCleanupService } from './session-cleanup.service';

describe('SessionCleanupService', () => {
  let service: SessionCleanupService;
  let tx: { $queryRaw: jest.Mock; session: { deleteMany: jest.Mock } };

  const mockPrisma = {
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      session: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    mockPrisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));

    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionCleanupService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<SessionCleanupService>(SessionCleanupService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('apaga as sessões expiradas quando obtém o advisory lock', async () => {
    tx.session.deleteMany.mockResolvedValue({ count: 4 });

    await service.deleteExpiredSessions();

    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('não apaga nada quando outra instância detém o lock', async () => {
    tx.$queryRaw.mockResolvedValue([{ locked: false }]);

    await service.deleteExpiredSessions();

    expect(tx.session.deleteMany).not.toHaveBeenCalled();
  });
});
