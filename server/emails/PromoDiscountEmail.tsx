import * as React from 'react';
import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  headline: string;
  discountCode: string;
  offerExpires: string;
  ctaLabel: string;
  ctaUrl: string;
  settingsUrl?: string;
  unsubscribeUrl?: string;
}

export default function PromoDiscountEmail({
  headline,
  discountCode,
  offerExpires,
  ctaLabel,
  ctaUrl,
  settingsUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <EmailLayout
      previewText={headline}
      variant="engagement"
      settingsUrl={settingsUrl}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text
        style={{
          backgroundColor: '#fef3c7',
          borderRadius: '6px',
          color: '#92400e',
          display: 'inline-block',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.05em',
          margin: '0 0 16px',
          padding: '4px 10px',
          textTransform: 'uppercase',
        }}
      >
        Limited Time Offer
      </Text>
      <Heading style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}>
        {headline}
      </Heading>
      <Text
        style={{
          backgroundColor: '#f8fafc',
          border: `2px dashed ${emailTheme.primary}`,
          borderRadius: '8px',
          color: emailTheme.primary,
          fontSize: '24px',
          fontWeight: 700,
          letterSpacing: '0.15em',
          margin: '0 0 16px',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        {discountCode}
      </Text>
      <Text style={{ color: emailTheme.muted, fontSize: '13px', margin: '0 0 24px', textAlign: 'center' }}>
        Offer expires: {offerExpires}
      </Text>
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
