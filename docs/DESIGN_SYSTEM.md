# AuditMind Design System Spec

This document records the visual identity tokens and UX criteria implemented for AuditMind, ensuring a premium, technical corporate appearance.

---

## 1. Color Palette

### 1.1. Base Theme Colors (Neuro-labs Dark Mode)
- **Base Canvas Background:** `#080A0F` (Dark slate space)
- **Technical Cards & Panels:** `#0F121D` (Frosted surface)
- **Interactions/Hover Panels:** `#171C2E` (Brighter Slate)
- **Borders & Rules:** `rgba(255, 255, 255, 0.05)` (Ultra-thin slate borders)

### 1.2. Brand Accents
- **Primary Accent:** `#00E5FF` (Clinical Electric Cyan)
- **Muted Accent:** `#0D9488` (Teal)
- **System Indicator:** `#3B82F6` (Clinical Blue)

### 1.3. Accessible Risk Tiers (WCAG AA Compliant)
- **Critical Risk:** `#EF4444` (Crimson Red)
- **High Risk:** `#F97316` (Technical Orange)
- **Medium Risk:** `#EAB308` (Technical Yellow)
- **Low Risk/Standard:** `#10B981` (Clinical Green)

---

## 2. Typography

- **Headings & Body Copy:** `Inter` or `Geist Sans`
  - High legibility, minimal humanist character widths.
  - Weights: `300` (light), `400` (regular), `500` (medium), `600` (semi-bold), `700` (bold).
- **Technical Elements (Clause IDs, metrics, code, logs):** `JetBrains Mono` or `Fira Code`
  - Standard monospace spacing to convey a scientific, analytical environment.

---

## 3. Glassmorphic Surface Specifications

Standardized UI components (cards, menus, drawers) must use the `.glass-panel` style structure:
- **Background:** `rgba(15, 18, 29, 0.75)`
- **Backdrop Filter:** `blur(12px)`
- **Border:** `1px solid rgba(255, 255, 255, 0.05)`
- **Shadow:** `0 4px 30px rgba(0, 0, 0, 0.4)`

---

## 4. Motion & Transition System

All interaction states, dropdown expansions, and panel transitions must follow a restrained, instrument-like movement profile (no bouncy consumer-app spring curves):
- **Standard Transition Duration:** `150ms` to `250ms`
- **Easing Curve:** `cubic-bezier(0.16, 1, 0.3, 1)` (Ultra-smooth ease-out)
- **Hover effects:** Minor border-color shifts (`rgba(0, 229, 255, 0.2)`) and background adjustments.
