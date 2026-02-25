import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPlanQuotaBullets } from "@/config/pricing";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-blue-600 mb-2">
              Terms of Service
            </CardTitle>
            <Badge variant="outline" className="w-fit mx-auto">
              TweetReply AI Chrome Extension
            </Badge>
            <p className="text-gray-600 mt-2">
              Last Updated: January 27, 2025
            </p>
          </CardHeader>
          
          <CardContent className="prose prose-lg max-w-none">
            <div className="space-y-6">
              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Agreement to Terms</h2>
                <p className="text-gray-700 leading-relaxed">
                  By accessing or using TweetReply AI ("we," "our," or "us"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Description of Service</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  TweetReply AI is a Chrome extension that provides AI driven reply generation for Twitter/X. Our service includes:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-2">
                  <li>AI generated reply suggestions for Twitter/X posts</li>
                  <li>Chrome extension for browser integration</li>
                  <li>Web interface for mobile and desktop access</li>
                  <li>Subscription-based access with usage quotas</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">User Accounts and Registration</h2>
                
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Account Requirements</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>You must be at least 13 years old to use our service</li>
                      <li>You must provide accurate and complete information when creating an account</li>
                      <li>You are responsible for maintaining the security of your account</li>
                      <li>You must notify us immediately of any unauthorized access</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Account Responsibility</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>You are responsible for all activities that occur under your account</li>
                      <li>You may not share your account credentials with others</li>
                      <li>You may not use another user's account without permission</li>
                      <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Subscription and Payment Terms</h2>
                
                <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-purple-800 mb-2">Subscription Plans</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      {getPlanQuotaBullets().map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                      <li>All subscriptions are billed in advance</li>
                    </ul>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-orange-800 mb-2">Payment Terms</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>Payments are processed through Dodo Payments</li>
                      <li>All prices are in USD unless otherwise stated</li>
                      <li>Subscriptions automatically renew unless cancelled</li>
                      <li>You can cancel your subscription at any time</li>
                      <li>Refunds are subject to our refund policy</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-yellow-800 mb-2">Cancellation and Refunds</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>You may cancel your subscription at any time</li>
                      <li>Your subscription will remain active until the end of your billing period</li>
                      <li>No refunds are provided for partial billing periods</li>
                      <li>Refunds for unused portions may be available on a case-by-case basis</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Acceptable Use Policy</h2>
                
                <div className="space-y-4">
                  <div className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Prohibited Activities</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>Using the service for illegal purposes or activities</li>
                      <li>Generating content that violates Twitter/X Terms of Service</li>
                      <li>Creating spam, harassment, or abusive content</li>
                      <li>Attempting to circumvent usage limits or quotas</li>
                      <li>Reverse engineering or attempting to access source code</li>
                      <li>Using automated systems to abuse the service</li>
                      <li>Violating any applicable laws or regulations</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Content Responsibility</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>You are solely responsible for all content you generate using our service</li>
                      <li>You must review and approve all generated replies before posting</li>
                      <li>We do not guarantee the accuracy or appropriateness of generated content</li>
                      <li>You agree not to hold us liable for any content you generate or post</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Intellectual Property</h2>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Our Property</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>All service content, features, and functionality are owned by us</li>
                      <li>Our trademarks, logos, and brand names are our property</li>
                      <li>You may not copy, modify, or distribute our content without permission</li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Your Content</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>You retain ownership of content you generate using our service</li>
                      <li>You grant us a license to use generated content for service improvement</li>
                      <li>You are responsible for ensuring you have rights to use any source material</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Service Availability and Modifications</h2>
                
                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Service Availability</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>We strive to provide reliable service but do not guarantee uninterrupted access</li>
                      <li>Service may be temporarily unavailable for maintenance or updates</li>
                      <li>We are not liable for service interruptions or downtime</li>
                    </ul>
                  </div>

                  <div className="border-l-4 border-green-500 pl-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Service Modifications</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>We reserve the right to modify or discontinue features at any time</li>
                      <li>We may update pricing, features, or terms with notice to users</li>
                      <li>Continued use of the service after changes constitutes acceptance</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Limitation of Liability</h2>
                
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <p className="text-gray-700 mb-3">
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    <li>We provide the service "as is" without warranties of any kind</li>
                    <li>We are not liable for any indirect, incidental, or consequential damages</li>
                    <li>Our total liability shall not exceed the amount you paid in the last 12 months</li>
                    <li>We are not responsible for content generated by our AI systems</li>
                    <li>You use the service at your own risk</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Termination</h2>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-red-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-red-800 mb-2">Termination by Us</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>We may suspend or terminate accounts that violate these terms</li>
                      <li>We may terminate service with reasonable notice</li>
                      <li>No refunds will be provided for terminated accounts</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Termination by You</h3>
                    <ul className="list-disc list-inside text-gray-700 space-y-1">
                      <li>You may cancel your subscription at any time</li>
                      <li>You may delete your account through account settings</li>
                      <li>Upon termination, your access to the service will cease</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Governing Law</h2>
                <p className="text-gray-700 leading-relaxed">
                  These Terms of Service shall be governed by and construed in accordance with the laws of the jurisdiction in which we operate, without regard to its conflict of law provisions. Any disputes arising from these terms shall be resolved through binding arbitration or in the appropriate courts.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">Contact Information</h2>
                
                <div className="bg-gray-50 p-6 rounded-lg">
                  <p className="text-gray-700 mb-4">
                    If you have questions about these Terms of Service, please contact us:
                  </p>
                  <div className="space-y-2">
                    <p><strong>Email:</strong> support@tweetreplyai.com</p>
                    <p><strong>Website:</strong> https://tweetreplyai.vercel.app/terms</p>
                    <p><strong>Response Time:</strong> We will respond within 48 hours</p>
                  </div>
                </div>
              </section>

              <div className="bg-blue-100 p-4 rounded-lg border-l-4 border-blue-500">
                <p className="text-blue-800 font-medium">
                  <strong>Note:</strong> By using TweetReply AI, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. 
                  If you do not agree with any part of these terms, please do not use our service.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

