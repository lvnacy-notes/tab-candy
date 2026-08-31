import { TIME_FORMAT } from '../../types';

/**
 * Returns the current time in a 00:00 format, either 12-hour or 24-hour
 */
export const getTime = (timeFormat: TIME_FORMAT) => {
	const today = new Date();
	let hours;
	if (timeFormat === TIME_FORMAT.TWELVE_HOUR) {
		hours =
			today.getHours() > 12
				? today.getHours() - 12
				: today.getHours() === 0
					? 12
					: today.getHours();
	} else {
		hours = today.getHours().toString().padStart(2, '0');
	}

	const minutes = today.getMinutes().toString().padStart(2, '0');

	return `${hours}:${minutes}`;
};

/**
 * Depending on the time of the day, returns a greeting like "Good morning"
 * @returns
 */
export const getTimeOfDayGreeting = () => {
	const hours = new Date().getHours();

	if (hours >= 18 || hours < 5) {
		return 'Good evening';
	} else if (hours >= 12) {
		return 'Good afternoon';
	} else {
		return 'Good morning';
	}
};
