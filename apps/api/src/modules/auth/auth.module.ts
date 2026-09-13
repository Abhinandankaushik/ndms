import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { JwtAuthGuard, RolesGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { OtpStore } from './otp.store';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { TokenService } from './token.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpStore,
    RefreshTokensRepository,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
