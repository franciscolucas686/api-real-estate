import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  UserNotFoundError,
} from '../common/errors';
import { ConfigService } from '../config/config.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };

  const mockSessionsService = {
    create: jest.fn(),
    rotate: jest.fn(),
    delete: jest.fn(),
    deleteAllForUser: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    jwtSecret: 'test-jwt-secret',
    jwtRefreshSecret: 'test-refresh-secret',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SessionsService, useValue: mockSessionsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('deve registrar um novo usuário', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'Test@1234',
        name: 'Test User',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'uuid',
        email: registerDto.email,
        name: registerDto.name,
        createdAt: new Date(),
      });
      mockJwtService.sign.mockReturnValue('token');

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toHaveProperty('email', registerDto.email);
    });

    it('deve lançar erro se email já existe', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'Test@1234',
      };

      mockUsersService.findByEmail.mockResolvedValue({ id: 'uuid', email: registerDto.email });

      await expect(service.register(registerDto)).rejects.toThrow(EmailAlreadyExistsError);
    });
  });

  describe('login', () => {
    it('deve fazer login com credenciais válidas', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Test@1234',
      };

      mockUsersService.findByEmail.mockResolvedValue({
        id: 'uuid',
        email: loginDto.email,
        password: '$2a$10$...',
        name: 'Test User',
      });

      mockJwtService.sign.mockReturnValue('token');

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result.user).toHaveProperty('email', loginDto.email);
      expect(mockSessionsService.create).toHaveBeenCalled();
    });

    it('deve lançar erro com email inválido', async () => {
      const loginDto = {
        email: 'invalid@example.com',
        password: 'Test@1234',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(InvalidCredentialsError);
    });

    it('deve lançar erro com senha inválida', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      mockUsersService.findByEmail.mockResolvedValue({
        id: 'uuid',
        email: loginDto.email,
        password: '$2a$10$...',
        name: 'Test User',
      });

      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(loginDto)).rejects.toThrow(InvalidCredentialsError);
    });

    it('abre uma sessão nova a cada login, sem tocar nas existentes', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'uuid',
        email: 'test@example.com',
        password: '$2a$10$...',
        name: 'Test User',
      });
      mockJwtService.sign.mockReturnValue('token');

      await service.login({ email: 'test@example.com', password: 'Test@1234' });
      await service.login({ email: 'test@example.com', password: 'Test@1234' });

      const [first, second] = mockSessionsService.create.mock.calls.map(([args]) => args);
      expect(first.id).not.toBe(second.id);
      // Nada de deleteAllForUser aqui: logar num segundo dispositivo não pode
      // derrubar o primeiro — é exatamente o defeito que o modelo de sessões corrige.
      expect(mockSessionsService.deleteAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('rotaciona apenas a sessão apresentada', async () => {
      mockUsersService.findById.mockResolvedValue({ id: 'uuid', email: 'test@example.com' });
      mockJwtService.sign.mockReturnValue('token');

      await service.refreshToken('uuid', 'sessao-do-desktop');

      expect(mockSessionsService.rotate).toHaveBeenCalledTimes(1);
      expect(mockSessionsService.rotate).toHaveBeenCalledWith(
        'sessao-do-desktop',
        expect.any(String),
        expect.any(Date),
      );
      // A sessão do celular não é lida nem escrita — este é o teste que falha se
      // alguém voltar a guardar um token por usuário.
      expect(mockSessionsService.deleteAllForUser).not.toHaveBeenCalled();
      expect(mockSessionsService.create).not.toHaveBeenCalled();
    });

    it('lança UserNotFoundError quando o usuário sumiu', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.refreshToken('uuid', 'sessao')).rejects.toThrow(UserNotFoundError);
    });
  });

  describe('logout', () => {
    it('apaga só a sessão do dispositivo que chamou', async () => {
      await service.logout('sessao-do-desktop');

      expect(mockSessionsService.delete).toHaveBeenCalledWith('sessao-do-desktop');
      expect(mockSessionsService.deleteAllForUser).not.toHaveBeenCalled();
    });

    it('logoutAll apaga todas as sessões do usuário', async () => {
      mockSessionsService.deleteAllForUser.mockResolvedValue(3);

      const result = await service.logoutAll('uuid');

      expect(mockSessionsService.deleteAllForUser).toHaveBeenCalledWith('uuid');
      expect(result.count).toBe(3);
    });
  });
});
