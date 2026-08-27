/**
 * Image file extensions (without the leading dot, lowercase) that Tab Candy
 * treats as valid background images.
 *
 * This is deliberately the single source of truth for that list. The
 * pre-refactor implementation had this drift in two different places: the
 * OS-folder sync allowed jpg/jpeg/png/webp/gif, while the manual "Add local
 * image" picker only allowed jpg/png - so a webp or gif behaved differently
 * depending on which of the two paths added it. Both the vault-folder sync
 * (`src/services/backgrounds.ts`) and the manual vault image picker
 * (`src/modals/ChooseImageSuggestModal.ts`) import from here instead of
 * hardcoding their own list.
 */
export const BACKGROUND_IMAGE_EXTENSIONS = [
	'jpg',
	'jpeg',
	'png',
	'webp',
	'gif',
];