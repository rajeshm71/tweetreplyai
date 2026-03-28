import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  settingsUrl?: string;
}

export default function FeatureUpdateEmail({ headline, body, ctaLabel, ctaUrl, settingsUrl }: Props) {
  return (
    <EmailLayout
      previewText={headline}
      variant="engagement"
      settingsUrl={settingsUrl}
    >
      <Text
        style={{
          backgroundColor: '#eff6ff',
          borderRadius: '6px',
          color: emailTheme.primary,
          display: 'inline-block',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.05em',
          margin: '0 0 16px',
          padding: '4px 10px',
          textTransform: 'uppercase',
        }}
      >
        New Feature
      </Text>
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        {headline}
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 24px' }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          {body}
        </Text>
      </Section>
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
