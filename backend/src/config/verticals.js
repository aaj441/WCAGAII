/**
 * Vertical-Specific WCAG Configuration
 *
 * Different industries have different accessibility priorities.
 * This module defines vertical-specific rule weights, thresholds,
 * and compliance requirements.
 *
 * Verticals:
 * - finance: Banking, fintech, payments (highest compliance)
 * - healthcare: Medical, patient portals (HIPAA + accessibility)
 * - government: Public services (.gov sites, Section 508)
 * - ecommerce: Online retail, shopping
 * - education: Schools, universities, learning platforms
 * - saas: B2B software platforms
 * - nonprofit: Charities, NGOs
 * - travel: Booking, hotels, airlines
 * - realestate: Property listings, rentals
 * - general: Default configuration
 */

const VERTICAL_CONFIGS = {
  finance: {
    name: 'Financial Services',
    description: 'Banking, fintech, payments, investment platforms',
    compliance: {
      level: 'AAA', // Highest standard
      standards: ['WCAG 2.2', 'Section 508', 'ADA Title III'],
      requiredScore: 95, // 95%+ compliance required
    },
    priorityRules: [
      // Critical for financial transactions
      {
        rule: 'color-contrast',
        weight: 10,
        reason: 'Numbers and amounts must be clearly readable',
      },
      {
        rule: 'label',
        weight: 10,
        reason: 'Form fields for sensitive data must have clear labels',
      },
      {
        rule: 'button-name',
        weight: 10,
        reason: 'Transaction buttons must have accessible names',
      },
      {
        rule: 'focus-visible',
        weight: 9,
        reason: 'Keyboard navigation critical for screen readers',
      },
      {
        rule: 'aria-required-attr',
        weight: 9,
        reason: 'Required form fields must be marked',
      },
      {
        rule: 'link-name',
        weight: 8,
        reason: 'Links to terms, policies must be identifiable',
      },
    ],
    tags: ['wcag2aaa', 'wcag21aaa', 'wcag22aa', 'best-practice', 'section508'],
    contextualGuidance: {
      colorContrast: 'Financial amounts must have 7:1 contrast ratio',
      forms: 'All transaction forms require clear error messaging',
      timeouts: 'Session timeouts must be communicated accessibly',
    },
  },

  healthcare: {
    name: 'Healthcare & Medical',
    description: 'Hospitals, clinics, patient portals, telehealth',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA', 'Section 508', 'HIPAA'],
      requiredScore: 92,
    },
    priorityRules: [
      {
        rule: 'color-contrast',
        weight: 10,
        reason: 'Medical information must be readable by elderly/visually impaired',
      },
      {
        rule: 'label',
        weight: 10,
        reason: 'Medical history forms require precise labels',
      },
      {
        rule: 'image-alt',
        weight: 9,
        reason: 'Medical images, charts must have descriptions',
      },
      {
        rule: 'heading-order',
        weight: 9,
        reason: 'Medical records navigation requires logical structure',
      },
      {
        rule: 'aria-roles',
        weight: 8,
        reason: 'Complex medical interfaces need proper roles',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'wcag22aa', 'section508'],
    contextualGuidance: {
      medicalImages: 'X-rays, charts need detailed alt text',
      patientForms: 'HIPAA-compliant accessible form design',
      emergencyInfo: 'Critical health info must be perceivable by all',
    },
  },

  government: {
    name: 'Government & Public Services',
    description: 'Federal, state, local government websites',
    compliance: {
      level: 'AA',
      standards: ['Section 508', 'WCAG 2.2 Level AA'],
      requiredScore: 100, // Government requires 100%
    },
    priorityRules: [
      {
        rule: 'document-title',
        weight: 10,
        reason: 'All government pages must have descriptive titles',
      },
      {
        rule: 'html-has-lang',
        weight: 10,
        reason: 'Language must be declared for screen readers',
      },
      {
        rule: 'label',
        weight: 10,
        reason: 'Government forms must be fully accessible',
      },
      {
        rule: 'link-name',
        weight: 9,
        reason: 'Navigation to public services must be clear',
      },
      {
        rule: 'landmark-one-main',
        weight: 9,
        reason: 'Page structure critical for navigation',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'wcag22aa', 'section508'],
    contextualGuidance: {
      publicForms: 'All citizen-facing forms must be 508 compliant',
      multiLanguage: 'Support for non-English speakers required',
      pdfs: 'All PDFs must be tagged and accessible',
    },
  },

  ecommerce: {
    name: 'E-Commerce & Retail',
    description: 'Online shopping, product catalogs, checkouts',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA', 'ADA Title III'],
      requiredScore: 85,
    },
    priorityRules: [
      {
        rule: 'button-name',
        weight: 10,
        reason: '"Add to cart" and checkout buttons must be accessible',
      },
      {
        rule: 'image-alt',
        weight: 10,
        reason: 'Product images need descriptive alt text',
      },
      {
        rule: 'color-contrast',
        weight: 9,
        reason: 'Prices and product details must be readable',
      },
      {
        rule: 'label',
        weight: 9,
        reason: 'Shipping and payment forms must have labels',
      },
      {
        rule: 'link-name',
        weight: 8,
        reason: 'Product links must identify items clearly',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
    contextualGuidance: {
      productImages: 'Alt text should include brand, color, size',
      checkout: 'Multi-step checkout must have clear progress indicators',
      filters: 'Product filters must be keyboard accessible',
    },
  },

  education: {
    name: 'Education & Learning',
    description: 'Universities, schools, online learning platforms',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA', 'Section 508'],
      requiredScore: 90,
    },
    priorityRules: [
      {
        rule: 'video-caption',
        weight: 10,
        reason: 'Educational videos must have captions',
      },
      {
        rule: 'heading-order',
        weight: 9,
        reason: 'Course materials need logical structure',
      },
      {
        rule: 'image-alt',
        weight: 9,
        reason: 'Diagrams and educational images need descriptions',
      },
      {
        rule: 'label',
        weight: 9,
        reason: 'Assignment submission forms must be accessible',
      },
      {
        rule: 'link-name',
        weight: 8,
        reason: 'Course navigation must be clear',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'wcag22aa', 'section508'],
    contextualGuidance: {
      videoContent: 'All lectures require captions and transcripts',
      mathContent: 'Mathematical notation needs MathML or descriptions',
      quizzes: 'Assessments must have extended time options indicated',
    },
  },

  saas: {
    name: 'SaaS & Software Platforms',
    description: 'B2B software, productivity tools, dashboards',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA'],
      requiredScore: 88,
    },
    priorityRules: [
      {
        rule: 'aria-roles',
        weight: 10,
        reason: 'Complex widgets need proper ARIA roles',
      },
      {
        rule: 'keyboard',
        weight: 10,
        reason: 'Power users rely on keyboard shortcuts',
      },
      {
        rule: 'focus-visible',
        weight: 9,
        reason: 'Focus indicators critical for navigation',
      },
      {
        rule: 'button-name',
        weight: 9,
        reason: 'Action buttons must have clear names',
      },
      {
        rule: 'color-contrast',
        weight: 8,
        reason: 'Data dashboards must be readable',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
    contextualGuidance: {
      dashboards: 'Data visualizations need text alternatives',
      modals: 'Dialogs must trap focus and have close buttons',
      tables: 'Data tables need proper headers and scopes',
    },
  },

  nonprofit: {
    name: 'Nonprofit & Charity',
    description: 'NGOs, foundations, charitable organizations',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA'],
      requiredScore: 85,
    },
    priorityRules: [
      {
        rule: 'button-name',
        weight: 10,
        reason: 'Donation buttons must be clearly labeled',
      },
      {
        rule: 'image-alt',
        weight: 9,
        reason: 'Impact photos need descriptive alt text',
      },
      {
        rule: 'color-contrast',
        weight: 9,
        reason: 'Donation amounts must be readable',
      },
      {
        rule: 'label',
        weight: 8,
        reason: 'Volunteer and donation forms need labels',
      },
      {
        rule: 'link-name',
        weight: 8,
        reason: 'Program links must be identifiable',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'best-practice'],
    contextualGuidance: {
      donationForms: 'Ensure tax-deductible info is accessible',
      impactStories: 'Use alt text to convey emotional impact',
      volunteerSignup: 'Forms must accommodate various abilities',
    },
  },

  travel: {
    name: 'Travel & Hospitality',
    description: 'Hotels, airlines, booking platforms, tourism',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA'],
      requiredScore: 85,
    },
    priorityRules: [
      {
        rule: 'button-name',
        weight: 10,
        reason: 'Booking buttons must be accessible',
      },
      {
        rule: 'label',
        weight: 9,
        reason: 'Date pickers and forms need clear labels',
      },
      {
        rule: 'image-alt',
        weight: 9,
        reason: 'Destination photos need descriptions',
      },
      {
        rule: 'color-contrast',
        weight: 8,
        reason: 'Pricing and itinerary details must be readable',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'best-practice'],
    contextualGuidance: {
      datePickers: 'Calendar widgets must be keyboard accessible',
      maps: 'Interactive maps need text alternatives',
      bookingFlow: 'Multi-step booking must indicate progress',
    },
  },

  realestate: {
    name: 'Real Estate & Property',
    description: 'Property listings, rentals, real estate platforms',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA'],
      requiredScore: 85,
    },
    priorityRules: [
      {
        rule: 'image-alt',
        weight: 10,
        reason: 'Property photos need descriptions',
      },
      {
        rule: 'button-name',
        weight: 9,
        reason: 'Contact and tour buttons must be accessible',
      },
      {
        rule: 'label',
        weight: 9,
        reason: 'Property search filters need labels',
      },
      {
        rule: 'color-contrast',
        weight: 8,
        reason: 'Prices and property details must be readable',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'best-practice'],
    contextualGuidance: {
      listings: 'Alt text should describe property features',
      virtualTours: '360° tours need accessible alternatives',
      contactForms: 'Inquiry forms must be keyboard accessible',
    },
  },

  general: {
    name: 'General',
    description: 'Default configuration for all other sites',
    compliance: {
      level: 'AA',
      standards: ['WCAG 2.2 Level AA'],
      requiredScore: 80,
    },
    priorityRules: [
      {
        rule: 'color-contrast',
        weight: 8,
        reason: 'Text must be readable',
      },
      {
        rule: 'image-alt',
        weight: 8,
        reason: 'Images need alternative text',
      },
      {
        rule: 'label',
        weight: 8,
        reason: 'Form controls need labels',
      },
      {
        rule: 'button-name',
        weight: 7,
        reason: 'Buttons need accessible names',
      },
      {
        rule: 'link-name',
        weight: 7,
        reason: 'Links need descriptive text',
      },
    ],
    tags: ['wcag2aa', 'wcag21aa', 'wcag22aa'],
    contextualGuidance: {
      general: 'Follow WCAG 2.2 Level AA guidelines',
    },
  },
};

/**
 * Get vertical configuration
 */
function getVerticalConfig(vertical) {
  return VERTICAL_CONFIGS[vertical] || VERTICAL_CONFIGS.general;
}

/**
 * Get all available verticals
 */
function getAvailableVerticals() {
  return Object.keys(VERTICAL_CONFIGS).map(key => ({
    id: key,
    name: VERTICAL_CONFIGS[key].name,
    description: VERTICAL_CONFIGS[key].description,
    requiredScore: VERTICAL_CONFIGS[key].compliance.requiredScore,
  }));
}

/**
 * Calculate vertical-weighted score
 */
function calculateVerticalScore(violations, vertical = 'general') {
  const config = getVerticalConfig(vertical);
  const ruleWeights = {};

  // Build weight map
  config.priorityRules.forEach(rule => {
    ruleWeights[rule.rule] = rule.weight;
  });

  let totalWeight = 0;
  let weightedViolations = 0;

  violations.forEach(violation => {
    const weight = ruleWeights[violation.id] || 5; // Default weight
    totalWeight += weight;
    weightedViolations += weight;
  });

  // Calculate score (higher is worse)
  const score = totalWeight > 0
    ? 100 - (weightedViolations / totalWeight * 100)
    : 100;

  return {
    score: Math.max(0, Math.min(100, score)),
    vertical,
    requiredScore: config.compliance.requiredScore,
    passed: score >= config.compliance.requiredScore,
  };
}

/**
 * Get axe-core tags for vertical
 */
function getVerticalTags(vertical = 'general') {
  const config = getVerticalConfig(vertical);
  return config.tags;
}

module.exports = {
  VERTICAL_CONFIGS,
  getVerticalConfig,
  getAvailableVerticals,
  calculateVerticalScore,
  getVerticalTags,
};
