const nodemailer = require('nodemailer');

exports.handler = async (event, context) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const { name, email, subject, message, token } = JSON.parse(event.body);

    // 1. Validate Input
    if (!name || !email || !message || !token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing required fields or turnstile token' })
      };
    }

    // 2. Verify Turnstile Token
    const turnstileData = new URLSearchParams();
    turnstileData.append('secret', process.env.TURNSTILE_SECRET_KEY);
    turnstileData.append('response', token);

    const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: turnstileData
    });

    const turnstileOutcome = await turnstileResponse.json();

    if (!turnstileOutcome.success) {
      console.error('Turnstile verification failed:', turnstileOutcome['error-codes']);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Turnstile verification failed', 
          details: turnstileOutcome['error-codes'] 
        })
      };
    }

    // 3. Nodemailer Transporter Setup
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // 4. Send Email
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.MAIL_TO || process.env.SMTP_USER,
      replyTo: email,
      subject: `Portfolio Contact: ${subject || 'New Message'}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Message sent successfully' })
    };

  } catch (error) {
    console.error('Error processing contact form:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' })
    };
  }
};
