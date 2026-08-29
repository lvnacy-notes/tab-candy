/**
 * Image file extensions (without the leading dot, lowercase) that Tab Candy
 * treats as valid background images.
 *
 * This is deliberately the single source of truth for that list. Both the
 * vault-folder sync (`src/services/backgrounds.ts`) and the manual vault
 * image picker (`src/modals/ChooseImageSuggestModal.ts`) import from here
 * instead of hardcoding their own list, so the two paths can't drift apart.
 */
export const BACKGROUND_IMAGE_EXTENSIONS = [
	'jpg',
	'jpeg',
	'png',
	'webp',
	'gif',
];