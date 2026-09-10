/**
 * Block component bootstrap — universal (runs on server AND client).
 *
 * Registers all block render components into the block registry so that
 * canvas pages are fully server-side rendered. Only add components here that
 * are SSR-safe (pure render components with no browser-only APIs).
 *
 * Admin/editor-only components (CanvasAdmin, CanvasContentEditor, etc.) are
 * registered separately in nuxflow-plugin-components.client.ts — they are
 * never needed during public-page SSR.
 */

import {
  CanvasBlockHero,
  CanvasBlockText,
  CanvasBlockImage,
  CanvasBlockColumns,
  CanvasBlockContainer,
  CanvasBlockCta,
  CanvasBlockSpacer,
  CanvasBlockVideo,
  CanvasBlockTestimonial,
  CanvasBlockFeatures,
  CanvasBlockGdpr,
  CanvasBlockFooter,
  CanvasBlockButton,
  CanvasBlockAccordion,
  CanvasBlockPricing,
  CanvasBlockGallery,
  CanvasBlockCarousel,
  CanvasBlockCalendar,
  HtmlBlock,
} from '@nuxflow/canvas'

import ContactFormBlock from '~/components/forms/ContactFormBlock.vue'
import DynamicFormBlock from '~/components/forms/DynamicFormBlock.vue'
import MembershipsBlock from '~/components/memberships/MembershipsBlock.vue'
import Paywall from '~/components/memberships/Paywall.vue'

// This plugin runs once per SSR *request* (Nuxt's normal per-request plugin
// lifecycle), but useBlockRegistry.ts's registry is a module-level singleton that
// persists for the whole Worker *isolate's* lifetime, not one request — Cloudflare
// Workers reuse isolates across many requests, unlike a traditional per-request
// server process. Without this guard, every request after the isolate's first would
// re-run every registration below and hit registry.register()'s own "already
// registered" guard for each one, logging a console.error 23 times on every single
// request forever (harmless functionally — the existing registration from the
// isolate's first request is untouched — but permanent, request-scaling log noise
// that also masks real errors). The registry itself can't tell "the built-in
// registering itself again, harmlessly" apart from "a genuine id collision from a
// dynamic plugin" (see the comment in useBlockRegistry.ts), so the guard belongs
// here, at the one call site that's actually expected to run more than once per
// module lifetime. Safe on the client too: each browser tab gets its own fresh
// module instantiation on page load, so `_registered` naturally starts `false` there
// regardless of any other tab or previous session.
let _registered = false

export default defineNuxtPlugin((nuxtApp) => {
  const registry = useBlockRegistry()

  if (!_registered) {
    _registered = true

    // ── Canvas blocks ─────────────────────────────────────────────────────────
    registry.register('canvas-hero',        { name: 'Hero',        icon: 'i-lucide-layout-template', component: CanvasBlockHero })
    registry.register('canvas-text',        { name: 'Text',        icon: 'i-lucide-type',             component: CanvasBlockText })
    registry.register('canvas-image',       { name: 'Image',       icon: 'i-lucide-image',            component: CanvasBlockImage })
    registry.register('canvas-video',       { name: 'Video',       icon: 'i-lucide-play-circle',      component: CanvasBlockVideo })
    registry.register('canvas-columns',     { name: 'Columns',     icon: 'i-lucide-columns-3',        component: CanvasBlockColumns })
    registry.register('canvas-container',   { name: 'Container',   icon: 'i-lucide-square',            component: CanvasBlockContainer })
    registry.register('canvas-features',    { name: 'Features',    icon: 'i-lucide-layout-grid',      component: CanvasBlockFeatures })
    registry.register('canvas-testimonial', { name: 'Testimonial', icon: 'i-lucide-quote',            component: CanvasBlockTestimonial })
    registry.register('canvas-cta',         { name: 'CTA Banner',  icon: 'i-lucide-megaphone',        component: CanvasBlockCta })
    registry.register('canvas-spacer',      { name: 'Spacer',      icon: 'i-lucide-move-vertical',    component: CanvasBlockSpacer })
    registry.register('canvas-gdpr',        { name: 'GDPR Banner', icon: 'i-lucide-cookie',           component: CanvasBlockGdpr })
    registry.register('canvas-footer',      { name: 'Footer',      icon: 'i-lucide-panel-bottom',     component: CanvasBlockFooter })
    registry.register('canvas-button',      { name: 'Button',      icon: 'i-lucide-square-play',       component: CanvasBlockButton })
    registry.register('canvas-accordion',   { name: 'Accordion',   icon: 'i-lucide-fold-vertical',     component: CanvasBlockAccordion })
    registry.register('canvas-pricing',     { name: 'Pricing Table', icon: 'i-lucide-credit-card',    component: CanvasBlockPricing })
    registry.register('canvas-gallery',     { name: 'Gallery',     icon: 'i-lucide-images',            component: CanvasBlockGallery })
    registry.register('canvas-carousel',    { name: 'Carousel',    icon: 'i-lucide-gallery-horizontal', component: CanvasBlockCarousel })
    registry.register('canvas-calendar',    { name: 'Events Calendar', icon: 'i-lucide-calendar',     component: CanvasBlockCalendar })

    // ── Forms blocks ──────────────────────────────────────────────────────────
    registry.register('contact-form/form', { name: 'Contact Form', icon: 'i-lucide-mail', component: ContactFormBlock })
    registry.register('dynamic-form/form', { name: 'Form', icon: 'i-lucide-list-checks', component: DynamicFormBlock })

    // ── Commerce blocks ───────────────────────────────────────────────────────
    registry.register('payments/memberships', { name: 'Membership Pricing', icon: 'i-lucide-badge-dollar-sign', component: MembershipsBlock })
    registry.register('payments/paywall',     { name: 'Paywall',            icon: 'i-lucide-lock',              component: Paywall })

    // ── Advanced blocks ───────────────────────────────────────────────────────
    registry.register('html-block/html', { name: 'HTML', icon: 'i-lucide-code-xml', component: HtmlBlock })
  }

  // Provide the block registry so canvas block components (BlockPicker,
  // CanvasBlock, useCanvas) can inject it without a circular import. Runs every
  // request regardless of the guard above — nuxtApp.vueApp is a fresh instance
  // per request and needs this every time, even once the registry itself is warm.
  nuxtApp.vueApp.provide('nuxflow:blockRegistry', registry)
})
