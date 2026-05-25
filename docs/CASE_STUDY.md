# Shohoj Case Study

## Problem

BRACU students struggle with CGPA planning, retake strategy, advising, and scattered course information. The work is usually split across calculators, unofficial spreadsheets, Facebook posts, and one-off advice from seniors.

## Solution

Shohoj combines CGPA calculation, transcript import, semester planning, degree tracking, reviews, and academic resources in one platform. It gives students a private academic workspace first, then layers in community knowledge through faculty reviews and past papers.

## My Role

Solo developer.

I built the frontend, Firebase authentication, Firestore database structure, security rules, Cloudflare Worker integration, CI/CD, testing, documentation, and product design.

## Key Engineering Challenges

1. Transcript PDF parsing
2. Retake/repeat CGPA logic
3. Firestore security rules
4. Pseudonymous faculty reviews
5. Cloudflare Worker + R2 file handling
6. CI/CD deployment

## Tech Decisions

Firebase was chosen for Google authentication, Firestore sync, and security rules because Shohoj needed a low-ops backend that still supported authenticated student data. GitHub Pages keeps the public frontend simple, cheap, and easy to deploy from CI. Cloudflare Worker + R2 handles past-paper files outside the static frontend while keeping download access behind Firebase token checks.

The first version uses vanilla JavaScript because the product needed fast iteration on academic logic, transcript parsing, security rules, and UX before committing to a heavier framework. That made it easier to prove the workflows and keep the deployed app lightweight.

## What I Learned

Shohoj pushed me through product thinking, security rules, testing, deployment automation, privacy documentation, and scalable architecture. It also made the edge cases real: repeated courses, partial transcripts, anonymous-but-moderated reviews, file ownership, and recruiter-friendly demos all shaped the engineering decisions.

## Next Steps

Screenshots and a short demo video, BRACU beta testing, more real faculty reviews and past papers, transcript-import validation across more real grade sheets, and the v0.4 TypeScript logic migration.
