import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  stage: 1 | 2 | 3;
  upgradeUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}

const stageConfig: Record<
  1 | 2 | 3,
  { subject: string; headline: string; body: string; cta: string }
> = {
  1: {
    subject: "You're replying like a pro 🎯",
    headline: "You're a power user 🎯",
    body: "You've hit your credit limit — that tells us you're serious about growing on Twitter. Upgrade now and keep the momentum going.",
    cta: 'Upgrade for Unlimited Replies',
  },
  2: {
    subject: "Don't lose your momentum",
    headline: "Don't lose your momentum 💪",
    body: "You had great engagement momentum before hitting your limit. Upgrade now and keep going — your audience is waiting.",
    cta: 'Keep My Momentum',
  },
  3: {
    subject: 'Last chance: upgrade and keep going',
    headline: 'Last chance to keep going ⚡',
    body: 'This is your final nudge. Upgrade now and get instant access to more credits — plus a head start on your next viral reply.',
    cta: 'Claim My Upgrade',
  },
};

export default function ConversionEmail({
  firstName,
  stage,
  upgradeUrl,
  settingsUrl,
  unsubscribeUrl,
}: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const config = stageConfig[stage];
  return (
    <EmailLayout
      previewText={config.subject}
      variant="alert"
      settingsUrl={settingsUrl}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        {config.headline}
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 24px' }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {greeting}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          {config.body}
        </Text>
      </Section>
      <Button
        href={upgradeUrl}
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
        {config.cta}
      </Button>
    </EmailLayout>
  );
}
