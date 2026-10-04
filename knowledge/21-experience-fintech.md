---
title: SDE work: fintech / accounting SaaS platform
section: experience
source: resume
tags: experience, fintech, accounting, simpleaccounts, spring boot, react, bugs, transaction, pagination, hibernate, jwt, accessibility, wcag, redux, debugging
---

As a Software Development Engineer at Data Innovations Technologies (April 2025 to present), Usaid works on a fintech / accounting SaaS platform built with Spring Boot and React. Highlights:

- Root-caused and fixed a Spring transaction-propagation defect that made bank-account creation report failure while the record was silently committed to PostgreSQL, by realigning transaction boundaries and enforcing explicit rollback.
- Eliminated a recurring falsy-zero pagination defect across 39 independent list/report screens in a React + Redux application.
- Resolved Hibernate LazyInitializationException crashes on production list endpoints by correcting @Transactional scoping, and hardened JWT handling so malformed tokens return 401 instead of 500, while removing token values from logs.
- Led a dark/light theme and WCAG-AA accessibility remediation across a 67-screen React front end, building Playwright-based audit tooling and cutting measured contrast failures from 38 to 0.
- Diagnosed a CSS cascade collision between Bootstrap and shadcn/ui and consolidated about 30 screens of duplicated dropdown styling into one design-token-driven module.
- Added JUnit 5/Mockito and Vitest regression coverage for 20+ production bug fixes.
