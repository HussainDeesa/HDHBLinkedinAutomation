/**
 * Centralized LinkedIn DOM selectors.
 *
 * LinkedIn changes its markup frequently and A/B tests layouts, so every
 * selector lives here and most are arrays of fallbacks tried in order. When
 * automation breaks, this is the first (and usually only) file to update.
 */

export const SELECTORS = {
  login: {
    username: "#username",
    password: "#password",
    submit: 'button[type="submit"]',
    // Presence of any of these means we're logged in / on the feed.
    loggedIn: [
      "#global-nav",
      ".global-nav",
      'input[placeholder*="Search"]',
      'a[href*="/feed/"]',
    ],
    // Challenge / checkpoint indicators.
    captcha: [
      "#captcha-internal",
      'iframe[src*="captcha"]',
      'input[name="captchaSiteKey"]',
      "div.recaptcha-checkbox",
    ],
    checkpoint: [
      'input[name="pin"]',
      "#input__phone_verification_pin",
      'h1:has-text("Let\'s do a quick security check")',
      'h1:has-text("Verify")',
    ],
  },

  search: {
    // People search result container variants.
    resultsContainer: [
      "ul[role='list']",
      ".search-results-container",
      ".reusable-search__entity-result-list",
    ],
    resultItem: [
      "li.reusable-search__result-container",
      "div.entity-result",
      "li[class*='result-container']",
    ],
    name: [
      "span.entity-result__title-text a span[aria-hidden='true']",
      ".entity-result__title-text a span span",
      "a.app-aware-link span[aria-hidden='true']",
    ],
    profileLink: [
      "span.entity-result__title-text a",
      ".entity-result__title-text a.app-aware-link",
      "a.app-aware-link[href*='/in/']",
    ],
    headline: [
      ".entity-result__primary-subtitle",
      "div.entity-result__primary-subtitle",
    ],
    location: [
      ".entity-result__secondary-subtitle",
      "div.entity-result__secondary-subtitle",
    ],
    nextPage: [
      "button[aria-label='Next']",
      "button.artdeco-pagination__button--next",
    ],
    // Inline "Connect" button on a search result card.
    connectButton: [
      "button[aria-label*='Invite'][aria-label*='connect']",
      "button[aria-label*='Connect']",
    ],
  },

  profile: {
    connectButton: [
      "button[aria-label*='Invite'][aria-label*='to connect']",
      "main button[aria-label*='Connect']",
      "button.pvs-profile-actions__action[aria-label*='Connect']",
    ],
    moreButton: [
      "button[aria-label='More actions']",
      "main button[aria-label*='More']",
    ],
    connectInMenu: ["div[aria-label*='connect']", "span:has-text('Connect')"],
    messageButton: [
      "button[aria-label*='Message']",
      "main a[aria-label*='Message']",
    ],
    name: ["h1", ".text-heading-xlarge"],
    headline: [".text-body-medium.break-words"],
  },

  connectModal: {
    addNote: [
      "button[aria-label='Add a note']",
      "button:has-text('Add a note')",
    ],
    noteTextarea: ["textarea[name='message']", "#custom-message"],
    send: [
      "button[aria-label='Send invitation']",
      "button[aria-label='Send now']",
      "button:has-text('Send')",
    ],
    sendWithoutNote: ["button[aria-label='Send without a note']"],
    dismiss: ["button[aria-label='Dismiss']"],
  },

  // My Network -> Connections page (sorted "Recently added" by default).
  connections: {
    // A single connection row/card. LinkedIn has shipped several layouts.
    card: [
      "li.mn-connection-card",
      "div.mn-connection-card",
      "li[componentkey]", // newer virtualized list rows
      "div.scaffold-finite-scroll__content > ul > li",
    ],
    name: [
      "span.mn-connection-card__name",
      ".mn-connection-card__details .mn-connection-card__name",
      "a[href*='/in/'] span[aria-hidden='true']",
      "a[href*='/in/'] .t-16",
    ],
    profileLink: [
      "a.mn-connection-card__link",
      "a.mn-connection-card__picture-wrapper",
      "a[href*='/in/']",
    ],
    occupation: [
      "span.mn-connection-card__occupation",
      ".mn-connection-card__details .mn-connection-card__occupation",
    ],
    // "Connected 2 months ago" / "Connected on June 10, 2026".
    connectedBadge: [
      "time.time-badge",
      ".mn-connection-card__timestamp",
      "span.time-badge",
    ],
    // Button that loads the next batch in the infinite-scroll list.
    loadMore: [
      "button.scaffold-finite-scroll__load-button",
      "button[aria-label*='Show more']",
      "button:has-text('Show more results')",
    ],
    // Shown when the account has no connections.
    empty: [".mn-connections__empty-state", "section.artdeco-empty-state"],
  },

  message: {
    messageBox: [
      "div.msg-form__contenteditable[contenteditable='true']",
      "div[role='textbox'][contenteditable='true']",
    ],
    sendButton: [
      "button.msg-form__send-button",
      "button[type='submit'].msg-form__send-button",
      "button:has-text('Send')",
    ],
    // Overlay close button after sending.
    closeOverlay: ["button[aria-label*='Close your conversation']"],
  },

  // Premium/upsell "spotlight" interstitials LinkedIn injects for free accounts
  // (e.g. after clicking Connect). They cover the page and block automation.
  modals: {
    // Presence of any of these means an upsell nag is on screen.
    premiumUpsell: [
      "a[href*='premium/products']",
      "a[href*='upsellOrderOrigin']",
      "a[href*='upsellSlotId']",
    ],
    // Close/dismiss affordances (Escape is used as the primary fallback).
    dismiss: [
      "button[aria-label='Dismiss']",
      "button[aria-label*='Dismiss']",
      "button[aria-label='Close']",
    ],
  },
} as const;
