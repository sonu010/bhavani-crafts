---
name: Artisanal Modernity
colors:
  surface: '#fbf9f4'
  surface-dim: '#dbdad5'
  surface-bright: '#fbf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ee'
  surface-container: '#f0eee9'
  surface-container-high: '#eae8e3'
  surface-container-highest: '#e4e2dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#54433e'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f1ec'
  outline: '#87736d'
  outline-variant: '#dac1bb'
  surface-tint: '#944933'
  primary: '#914631'
  on-primary: '#ffffff'
  primary-container: '#af5e47'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb5a0'
  secondary: '#366664'
  on-secondary: '#ffffff'
  secondary-container: '#baece9'
  on-secondary-container: '#3d6c6a'
  tertiary: '#635f40'
  on-tertiary: '#ffffff'
  tertiary-container: '#b2ac88'
  on-tertiary-container: '#444024'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd1'
  primary-fixed-dim: '#ffb5a0'
  on-primary-fixed: '#3b0900'
  on-primary-fixed-variant: '#76321e'
  secondary-fixed: '#baece9'
  secondary-fixed-dim: '#9ed0cd'
  on-secondary-fixed: '#00201f'
  on-secondary-fixed-variant: '#1c4e4c'
  tertiary-fixed: '#eae3bc'
  tertiary-fixed-dim: '#cec7a2'
  on-tertiary-fixed: '#1f1c04'
  on-tertiary-fixed-variant: '#4b472b'
  background: '#fbf9f4'
  on-background: '#1b1c19'
  surface-variant: '#e4e2dd'
typography:
  h1:
    fontFamily: Newsreader
    fontSize: 4.5rem
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h2:
    fontFamily: Newsreader
    fontSize: 3rem
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h3:
    fontFamily: Newsreader
    fontSize: 2rem
    fontWeight: '500'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Manrope
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Manrope
    fontSize: 0.75rem
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.1em
  button:
    fontFamily: Manrope
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 2rem
  margin-page: 5vw
  stack-sm: 1rem
  stack-md: 2.5rem
  stack-lg: 5rem
---

## Brand & Style

This design system is built to bridge the gap between traditional heritage crafts and a sophisticated, next-generation digital experience. The brand personality is **Artisanal, Curated, and Tactile**, aiming to evoke a sense of physical touch and storytelling in a digital space. 

The visual style blends **Minimalism** with **Tactile-Modernism**. We utilize generous whitespace to create an editorial feel, allowing high-resolution craft photography to serve as the primary interface element. By incorporating subtle neumorphic hints—soft extrusions and light-filled shadows—the UI feels like it is made of physical material, inviting users to "touch" the products through their screens. The goal is to move away from the cold, transactional nature of traditional e-commerce and toward an inspiration-driven discovery journey.

## Colors

The palette is rooted in the earth, using **Terracotta** as the primary driver for action and warmth, reflecting the clay and natural dyes of Bhavani Crafts. **Deep Teal** provides a sophisticated contrast for grounding elements, while **Sage** acts as a soft secondary tone for secondary UI surfaces.

The neutral base is a warm, paper-like off-white (`#F9F7F2`) rather than a clinical white, reinforcing the "Tactile-Modern" feel. **Bright Orange** and **Sunny Yellow** are reserved for category signifiers and micro-interactions, ensuring the interface feels vibrant and alive without sacrificing its premium, curated aesthetic.

## Typography

This design system employs a high-contrast typographic pairing to signal both craft and modern utility. 

**Newsreader** is our editorial voice. Its handcrafted-feel serifs are used for large headlines and storytelling moments, echoing the imperfections and beauty of physical craft. 

**Manrope** serves as our functional workhorse. It is a clean, geometric sans-serif that ensures high legibility for product details, navigation, and transactional UI elements. Large headlines should use tighter letter spacing, while labels and metadata utilize increased tracking to maintain clarity and a premium feel.

## Layout & Spacing

To avoid the "boxed" look of standard e-commerce, this design system utilizes a **Staggered Masonry Fluid Grid**. While content sits on a 12-column foundation, vertical alignment is intentionally offset to create a natural, organic flow that mimics an art gallery or a maker's workshop.

Spacing is generous, using a base 8px rhythm. Significant vertical gaps (`stack-lg`) are used to separate different craft stories, ensuring the user is never overwhelmed by "choice paralysis." Margins are defined by viewport width to ensure the immersive photography feels expansive on any device.

## Elevation & Depth

Depth in this design system is achieved through **Ambient Soft Shadows** and **Multi-layered Tonalism**. We avoid harsh dropshadows. Instead, we use two layers of shadows:
1.  A broad, low-opacity shadow tinted with the `secondary_color` (Deep Teal) to ground elements.
2.  A tight, slightly more opaque shadow to define the immediate edge.

To achieve the "Tactile-Modern" effect, certain interactive cards use a **Soft Extrusion**—a subtle highlight on the top-left edge and a shadow on the bottom-right—making the element appear as if it is rising out of the warm neutral background. This creates a "squishy" physical metaphor for buttons and interactive cards.

## Shapes

The shape language is defined by **Softened Geometry**. We use a `roundedness` level of `2` (0.5rem base) to move away from sharp, aggressive corporate corners. 

- Large product cards use `rounded-xl` (1.5rem) to feel friendly and substantial.
- Buttons and input fields use `rounded-lg` (1rem) for a more pill-like, ergonomic feel.
- Decorative elements, such as image containers in storytelling sections, may feature organic, asymmetrical radii to emphasize the "handcrafted" theme.

## Components

### Cards
Cards are the core of this design system. They should not have visible borders. Instead, use the elevation techniques described in the Elevation & Depth section. Cards should have varying aspect ratios (3:4, 4:5, 1:1) and be arranged in a staggered layout to provide a sense of discovery.

### Buttons
Primary buttons use the **Terracotta** fill with white text. They should have a "subtle lift" on hover, increasing the shadow spread. Secondary buttons use the **Deep Teal** in an outline style or a flat "Sage" background.

### Chips & Category Tags
Tags use the vibrant accent colors (Orange, Yellow) with low-opacity backgrounds of the same hue. This allows them to pop against the earthy palette without being distracting.

### Inputs & Form Fields
Input fields should feel "inset" into the page. Use a subtle inner shadow to create a recessed effect, reinforcing the tactile nature of the UI. Focus states are indicated by a 2px Terracotta border.

### Immersive Components
- **The Story Scroller:** A horizontal-scroll component for artisan bios that uses large-scale typography overlaying photography.
- **The Craft Filter:** A floating, tactile navigation bar at the bottom of the viewport for easy category switching on mobile.