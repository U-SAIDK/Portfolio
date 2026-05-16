require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Contact Route
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message, token } = req.body;

    // 1. Validate Input
    if (!name || !email || !message || !token) {
      return res.status(400).json({ success: false, error: 'Missing required fields or turnstile token' });
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
      return res.status(400).json({ success: false, error: 'Turnstile verification failed' });
    }

    // 3. Send Email
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.MAIL_TO || process.env.SMTP_USER, // Default to sending to oneself if MAIL_TO not set
      replyTo: email,
      subject: `Portfolio Contact: ${subject || 'New Message'}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    };

    await transporter.sendMail(mailOptions);

    // 4. Return Success
    res.status(200).json({ success: true, message: 'Message sent successfully' });

  } catch (error) {
    console.error('Error processing contact form:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
