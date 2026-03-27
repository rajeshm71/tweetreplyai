import * as React from 'react';
import { render } from '@react-email/render';
import WelcomeEmail from './emails/WelcomeEmail.js';
import PasswordResetEmail from './emails/PasswordResetEmail.js';

export interface TransactionalEmailPayload {
  subject: string;
  html: string;
  text: string;
}

interface WelcomeParams {
  firstName?: string;
  appUrl: string;
}

interface PasswordResetParams {
  resetUrl: string;
}

export async function renderWelcomeEmail({ firstName, appUrl }: WelcomeParams): Promise<TransactionalEmailPayload> {
  const safeAppUrl = appUrl.replace(/\/$/, '');
  const subject = 'Welcome to TweetReply';
  const element = <WelcomeEmail firstName={firstName} appUrl={safeAppUrl} />;
  const html = await render(element, { pretty: true });
  const text = await render(element, { plainText: true });
  return { subject, html, text };
}

export async function renderPasswordResetEmail({ resetUrl }: PasswordResetParams): Promise<TransactionalEmailPayload> {
  const subject = 'Reset your password';
  const element = <PasswordResetEmail resetUrl={resetUrl} />;
  const html = await render(element, { pretty: true });
  const text = await render(element, { plainText: true });
  return { subject, html, text };
}
