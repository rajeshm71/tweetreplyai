import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { emailTheme } from './theme.js';

export type EmailLayoutVariant = 'welcome' | 'transactional' | 'billing' | 'alert' | 'engagement';

const footerCopy: Record<EmailLayoutVariant, string> = {
  welcome: "You're receiving this because you signed up for TweetReply.",
  transactional: "You're receiving this because a password reset was requested for this email address.",
  billing: "You're receiving this because it relates to your TweetReply billing or subscription.",
  alert: "You're receiving this because you have usage alerts enabled. Update preferences in your account settings.",
  engagement: "You're receiving this because you have product tips enabled. You can update your email preferences in your account settings.",
};

export interface EmailLayoutProps {
  previewText: string;
  variant: EmailLayoutVariant;
  children: React.ReactNode;
  settingsUrl?: string;
}

export function EmailLayout({ previewText, variant, children, settingsUrl }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: emailTheme.bgOuter,
          fontFamily: emailTheme.fontFamily,
          margin: 0,
          padding: '32px 16px',
        }}
      >
        <Container
          style={{
            backgroundColor: emailTheme.card,
            border: `1px solid ${emailTheme.border}`,
            borderRadius: '12px',
            margin: '0 auto',
            maxWidth: '600px',
            overflow: 'hidden',
            padding: '0',
          }}
        >
          <Section
            style={{
              backgroundColor: emailTheme.primary,
              padding: '24px 32px',
            }}
          >
            <Text
              style={{
                color: emailTheme.primaryForeground,
                fontSize: '22px',
                fontWeight: 700,
                margin: 0,
              }}
            >
              TweetReply
            </Text>
          </Section>
          <Section style={{ padding: '32px' }}>{children}</Section>
          <Hr style={{ borderColor: emailTheme.border, margin: 0 }} />
          <Section style={{ padding: '20px 32px 28px' }}>
            <Text
              style={{
                color: emailTheme.muted,
                fontSize: '12px',
                lineHeight: '18px',
                margin: 0,
              }}
            >
              {footerCopy[variant]}
              {settingsUrl && (variant === 'alert' || variant === 'engagement') && (
                <>
                  {' '}
                  <Link href={settingsUrl} style={{ color: emailTheme.muted, textDecoration: 'underline' }}>
                    Manage email preferences
                  </Link>
                </>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
