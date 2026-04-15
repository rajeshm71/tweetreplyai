import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { APP_DISPLAY_NAME } from '@shared/constants';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-blue-600 mb-2">
              Privacy Policy
            </CardTitle>
            <Badge variant="outline" className="w-fit mx-auto">
              {`${APP_DISPLAY_NAME} Chrome Extension`}
            </Badge>
            <p className="text-gray-600 mt-2">
              Last Updated: October 27, 2025
            </p>
          </CardHeader>
          
          <CardContent className="prose prose-lg max-w-none">
            <div className="space-y-6">
              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Introduction</h2>
                <p className="text-gray-700 leading-relaxed">
                  {`${APP_DISPLAY_NAME} ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our Chrome extension and related services.`}
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Information We Collect</h2>
                
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Authentication Information</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><strong>Google Account Information:</strong> When you sign in, we collect your email address and basic profile information from Google OAuth</li>
                      <li><strong>Authentication Tokens:</strong> We store encrypted authentication tokens locally in your browser to maintain your login session</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Usage Data</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><strong>Credit Usage:</strong> We track credit consumption for quota management purposes</li>
                      <li><strong>Extension Usage:</strong> We collect basic usage statistics to improve our service and enforce usage limits</li>
                    </ul>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-purple-800 mb-2">Generated Content</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><strong>Reply History:</strong> Generated replies are stored locally in your browser for your convenience and to provide reply history features</li>
                      <li><strong>Performance Metrics:</strong> We may collect performance data about generated replies for quality improvement</li>
                    </ul>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-orange-800 mb-2">Technical Information</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><strong>Browser Information:</strong> Basic browser and extension version information for compatibility purposes</li>
                      <li><strong>Error Logs:</strong> Technical error information to help us debug and improve the extension</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">How We Use Your Information</h2>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Primary Uses</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>Service Provision: To provide AI driven reply generation services</li>
                      <li>Authentication: To maintain your login session and verify your identity</li>
                      <li>Quota Management: To enforce usage limits and subscription tiers</li>
                      <li>Service Improvement: To analyze usage patterns and improve our AI models</li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Secondary Uses</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>Analytics: To understand how users interact with our extension</li>
                      <li>Quality Assurance: To monitor and improve the quality of generated replies</li>
                      <li>Customer Support: To provide technical support and resolve issues</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Information Storage and Security</h2>
                
                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Local Storage</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><strong>Browser Storage:</strong> Most data is stored locally in your browser using Chrome's storage APIs</li>
                      <li><strong>Encryption:</strong> Sensitive data is encrypted before storage</li>
                      <li><strong>User Control:</strong> You can clear all stored data by uninstalling the extension</li>
                    </ul>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Server Storage</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li><strong>Minimal Server Data:</strong> We store minimal data on our servers, primarily for authentication and quota management</li>
                      <li><strong>Secure Infrastructure:</strong> Our servers use industry-standard security measures</li>
                      <li><strong>Data Retention:</strong> We retain data only as long as necessary for service provision</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Information Sharing</h2>
                
                <div className="bg-red-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-red-800 mb-2">We Do NOT Share Your Data With:</h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    <li><strong>Third Parties:</strong> We do not sell, rent, or share your personal information with third parties</li>
                    <li><strong>Advertisers:</strong> We do not use your data for advertising purposes</li>
                    <li><strong>Data Brokers:</strong> We do not provide your data to data brokers or similar entities</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Your Rights and Choices</h2>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Access and Control</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>Data Access: You can request access to your personal data</li>
                      <li>Data Correction: You can request correction of inaccurate data</li>
                      <li>Data Deletion: You can request deletion of your personal data</li>
                      <li>Data Portability: You can request a copy of your data in a portable format</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Extension Controls</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>Uninstall: You can uninstall the extension at any time to remove all stored data</li>
                      <li>Sign Out: You can sign out to revoke access to your Google account</li>
                      <li>Clear Data: You can clear extension data through Chrome's extension management</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Chrome Extension Permissions</h2>
                
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <p className="text-gray-700 mb-3">Our extension requests the following permissions:</p>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    <li><strong>activeTab:</strong> Access current Twitter/X tab only when you click the extension</li>
                    <li><strong>storage:</strong> Save your preferences and settings locally</li>
                    <li><strong>scripting:</strong> Inject content scripts for text insertion</li>
                    <li><strong>host permissions:</strong> Work on twitter.com and x.com domains</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Contact Information</h2>
                
                <div className="bg-gray-50 p-6 rounded-lg">
                  <p className="text-gray-700 mb-4">
                    If you have questions about this Privacy Policy or our privacy practices, please contact us:
                  </p>
                  <div className="space-y-2">
                    <p><strong>Email:</strong> privacy@tweetreplyai.com</p>
                    <p><strong>Website:</strong> https://tweetreplyai.vercel.app/privacy</p>
                    <p><strong>Response Time:</strong> We will respond within 48 hours</p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Compliance</h2>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Regulatory Compliance</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>GDPR: General Data Protection Regulation (EU)</li>
                      <li>CCPA: California Consumer Privacy Act (US)</li>
                      <li>COPPA: Children's Online Privacy Protection Act (US)</li>
                      <li>Chrome Web Store Developer Program Policies</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Security Measures</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>Encryption: Data is encrypted in transit and at rest</li>
                      <li>Access Controls: Strict access controls limit who can access your data</li>
                      <li>Regular Audits: We regularly audit our security practices</li>
                      <li>Data Minimization: We collect only the data necessary for our services</li>
                    </ul>
                  </div>
                </div>
              </section>

              <div className="bg-blue-100 p-4 rounded-lg border-l-4 border-blue-500">
                <p className="text-blue-800 font-medium">
                  <strong>Note:</strong> {`By using ${APP_DISPLAY_NAME}, you agree to the terms outlined in this Privacy Policy.`} 
                  If you do not agree with any part of this policy, please do not use our extension.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
