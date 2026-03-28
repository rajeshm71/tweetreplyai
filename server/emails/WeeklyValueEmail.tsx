import * as React from 'react';
import { Button, Heading, Hr, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Tip {
  headline: string;
  body: string;
}

interface Props {
  firstName?: string;
  tips: Tip[];
  appUrl: string;
  settingsUrl?: string;
}

export default function WeeklyValueEmail({ firstName, tips, appUrl, settingsUrl }: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout
      previewText="5 reply frameworks that actually work this week"
      variant="engagement"
      settingsUrl={settingsUrl}
    >
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 8px' }}>
        This week's reply frameworks 🧵
      </Heading>
      <Text style={{ color: emailTheme.muted, fontSize: '14px', margin: '0 0 24px' }}>
        5 reply frameworks that actually work this week
      </Text>
      <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 24px' }}>
        {greeting}
      </Text>
      {tips.map((tip, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Hr style={{ borderColor: emailTheme.border, margin: '16px 0' }} />}
          <Text style={{ color: emailTheme.primary, fontSize: '13px', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Framework {i + 1}
          </Text>
          <Text style={{ color: emailTheme.text, fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>
            {tip.headline}
          </Text>
          <Text style={{ color: emailTheme.text, fontSize: '14px', lineHeight: '22px', margin: '0' }}>
            {tip.body}
          </Text>
        </React.Fragment>
      ))}
      <Hr style={{ borderColor: emailTheme.border, margin: '24px 0' }} />
      <Button
        href={appUrl}
        style={{
          backgroundColor: emailTheme.primary,
          borderRadius: '8px',
          color: emailTheme.primaryForeground,
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 28px',
          textDecoration: 'none',
        }}
      >
        Generate a Reply Now
      </Button>
    </EmailLayout>
  );
}
