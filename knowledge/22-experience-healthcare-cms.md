---
title: SDE work: healthcare practice-management CMS
section: experience
source: resume
tags: experience, healthcare, cms, next.js, prisma, postgres, static site, seo, hydration, contact form, rate limiting, authentication, clinic
---

At Data Innovations Technologies Usaid built a healthcare practice-management CMS and marketing platform with Next.js and React. Highlights:

- Built a database-backed content management system (Postgres, Prisma ORM) for a healthcare clinic's public site and admin dashboard, with JWT access/refresh-token authentication using hashed refresh tokens, audit logging, appointment booking, and blog/service/team content management.
- Migrated the public site from per-request, database-backed rendering to a fully static, build-time-generated Next.js architecture, removing the runtime database dependency while preserving SEO metadata, sitemap and structured data.
- Diagnosed and fixed an SSR/CSR hydration mismatch in a reduced-motion accessibility hook.
- Resolved a recurring build-and-deploy failure caused by a native image-processing dependency missing from the serverless bundle.
- Engineered a spam-resistant contact form pipeline with schema validation, honeypot fields, per-IP rate limiting and dual-recipient SMTP delivery.
