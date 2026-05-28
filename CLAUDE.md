# Project: My App

## Stack
- React 18 + Vite
- Framer Motion (installed)
- UI UX Pro Max → at ./libs/ui-ux-pro-max/src/
- TailwindCSS
- React Router v6

## Component Library Location
./libs/ui-ux-pro-max/src/components/
Read this folder to know all available components.

## Design System
- Font: Syne (display), Space Grotesk (body)
- Primary color: #00ff88
- Background: #050808
- Style: dark, glassmorphism, neon accents
- Always use Framer Motion, NEVER plain CSS transitions

## Code Rules
- Functional components only, no class components
- Always use motion.div not regular div for animated elements
- File names: PascalCase for components
- Always destructure props
- Mobile first, always responsive

## Folder Structure
src/
├── components/     ← reusable components
├── pages/          ← full pages
├── hooks/          ← custom hooks
├── utils/          ← helpers
└── assets/         ← images, fonts

## Import Aliases
- @/components → src/components
- @/hooks → src/hooks
- @/utils → src/utils
- @ui → libs/ui-ux-pro-max/src/components

## What Claude Should ALWAYS Do
- Read existing code before writing new code
- Keep existing styles/structure untouched unless asked
- Add comments on complex logic
- Make animations smooth (spring physics preferred)
- Test that imports actually exist before using them

## What Claude Should NEVER Do
- Install new packages without asking
- Use inline styles (use Tailwind instead)
- Delete existing code without confirmation
- Use any, ignore TypeScript errors