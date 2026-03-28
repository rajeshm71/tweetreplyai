import * as React from 'react';
import { Button, Heading, Hr, Text } from '@react-email/components';
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
}

export default function NewsletterEmail({ issueNumber, tips, ctaLabel, ctaUrl, settingsUrl }: Props) {
  return (
    <EmailLayout
      previewText={`TweetReply Newsletter — Issue #${issueNumber}`}
      variant="engagement"
      settingsUrl={settingsUrl}
    >
      <Text style={{ color: emailTheme.muted, fontSize: '13px', margin: '0 0 4px' }}>
        ISSUE #{issueNumber}
      </Text>
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 24px' }}>
        TweetReply Newsletter
      </Heading>
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
      <Hr style={{ borderColor: emailTheme.border, margin: '24px 0' }} />
      <Button
        href={ctaUrl}
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
        {ctaLabel}
      </Button>
    </EmailLayout>
  );
}
