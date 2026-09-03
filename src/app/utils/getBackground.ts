import { BackgroundTheme } from '../../types';

/**
 * Gets the background URL based on the theme settings
 * @param backgroundTheme
 * @param customBackground
 */
const getBackground = (
	backgroundTheme: BackgroundTheme,
	customBackground: string,
	localBackgrounds: string[]
): string | null => {
	switch (backgroundTheme) {
		case BackgroundTheme.CUSTOM:
			return customBackground;
		case BackgroundTheme.LOCAL:
			return localBackgrounds[
				Math.floor(Math.random() * localBackgrounds.length)
			];
		case BackgroundTheme.TRANSPARENT_WITH_SHADOWS:
		case BackgroundTheme.TRANSPARENT:
			return null;
		default:
			return null;
	}
};

export default getBackground;