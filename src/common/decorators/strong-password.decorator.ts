import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Password policy shared by register and change-password. 72 = bcrypt's input limit. */
export const StrongPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(8),
    MaxLength(72),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
      message: '$property must contain at least one letter and one number',
    }),
  );
