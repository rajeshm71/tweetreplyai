import * as React from 'react';
import { Button, Heading, Hr, Section, Text } from '@react-email/components';
import { APP_DISPLAY_NAME } from '../../shared/constants.js';
import { EmailLayout } from './EmailLayout.js';
import { emailTheme } from './theme.js';

interface Props {
  firstName?: string;
  amountFormatted: string;
  planName: string;
  receiptDate: string;
  invoiceNumber?: string;
  billingUrl: string;
}

export default function PaymentReceiptEmail({
  firstName,
  amountFormatted,
  planName,
  receiptDate,
  invoiceNumber,
  billingUrl,
}: Props) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return (
    <EmailLayout
      previewText={`${APP_DISPLAY_NAME} receipt — ${amountFormatted}`}
      variant="transactional"
    >
      <Heading
        style={{ color: emailTheme.text, fontSize: '22px', fontWeight: 700, margin: '0 0 16px' }}
      >
        Thanks for your payment
      </Heading>
      <Section style={{ textAlign: 'left' as const, margin: '0 0 16px' }}>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }}>
          {greeting}
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', lineHeight: '24px', margin: 0 }}>
          {`Here's your receipt for ${APP_DISPLAY_NAME}. Keep this for your records.`}
        </Text>
      </Section>

      <Section
        style={{
          background: emailTheme.card,
          border: `1px solid ${emailTheme.border}`,
          borderRadius: '10px',
          padding: '16px 20px',
          margin: '0 0 20px',
        }}
      >
        <Text style={{ color: emailTheme.muted, fontSize: '13px', margin: '0 0 4px' }}>
          Amount
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>
          {amountFormatted}
        </Text>
        <Hr style={{ border: 'none', borderTop: `1px solid ${emailTheme.border}`, margin: '12px 0' }} />
        <Text style={{ color: emailTheme.muted, fontSize: '13px', margin: '0 0 2px' }}>
          Plan
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', margin: '0 0 10px' }}>
          {planName}
        </Text>
        <Text style={{ color: emailTheme.muted, fontSize: '13px', margin: '0 0 2px' }}>
          Date
        </Text>
        <Text style={{ color: emailTheme.text, fontSize: '15px', margin: '0 0 10px' }}>
          {receiptDate}
        </Text>
        {invoiceNumber ? (
          <>
            <Text style={{ color: emailTheme.muted, fontSize: '13px', margin: '0 0 2px' }}>
              Invoice
            </Text>
            <Text style={{ color: emailTheme.text, fontSize: '15px', margin: 0 }}>
              {invoiceNumber}
            </Text>
          </>
        ) : null}
      </Section>

      <Button
        href={billingUrl}
        style={{
          backgroundColor: emailTheme.primary,
          borderRadius: '8px',
          color: emailTheme.primaryForeground,
          display: 'inline-block',
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 24px',
          textDecoration: 'none',
        }}
      >
        View billing
      </Button>
    </EmailLayout>
  );
}
