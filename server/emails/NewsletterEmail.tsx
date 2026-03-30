import * as React from 'react';
import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { APP_DISPLAY_NAME } from '../../shared/constants.js';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Tip {
  headline: string;
  body: string;
}

interface Props {
  issueNumber: string;
  tips: Tip[];
  ctaLabel: string;
  ctaUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}

export default function NewsletterEmail({
  issueNumber,
  tips,
  ctaLabel,
  ctaUrl,
  settingsUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <EmailLayout
      previewText={`${APP_DISPLAY_NAME} Newsletter — Issue #${issueNumber}`}
      variant="engagement"
      settingsUrl={settingsUrl}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={{ color: emailTheme.muted, fontSize: '13px', margin: '0 0 4px' }}>
        ISSUE #{issueNumber}
      </Text>
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 24px' }}>
        {APP_DISPLAY_NAME} Newsletter
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 8px' }}>
        {tips.map((tip, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Hr style={{ borderColor: emailTheme.border, margin: '20px 0' }} />}
            <Text style={{ color: emailTheme.primary, fontSize: '12px', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              #{i + 1}
            </Text>
            <Text style={{ color: emailTheme.text, fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>
              {tip.headline}
            </Text>
            <Text style={{ color: emailTheme.text, fontSize: '14px', lineHeight: '22px', margin: 0 }}>
              {tip.body}
            </Text>
          </React.Fragment>
        ))}
      </Section>
      <Hr style={{ borderColor: emailTheme.border, margin: '24px 0' }} />
      <Button
        href={ctaUrl}
        style={{
          backgroundColor: emailTheme.primary,
          borderRadius: '8px',
          color: emailTheme.primaryForeground,
          display: 'inline-block',
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 28px',
          textDecoration: 'none',
        }}
      >
        {ctaLabel}
      </Button>
    </EmailLayout>
  );
}
