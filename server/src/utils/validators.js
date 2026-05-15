const USERNAME_MIN_LENGTH = 4;
const USERNAME_MAX_LENGTH = 16;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const DISPLAY_NAME_MIN_LENGTH = 3;
const DISPLAY_NAME_MAX_LENGTH = 20;
const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_()\-]+(?: [A-Za-z0-9_()\-]+)*$/;

export const validateUsername = (username) => {
  if (typeof username !== 'string') {
    return 'Username is required';
  }

  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return 'Username must be between 4 and 16 characters';
  }

  if (!USERNAME_PATTERN.test(username)) {
    return 'Username may contain only letters, numbers, "_" and "-"';
  }

  return null;
};

export const validateDisplayedName = (displayedName) => {
  if (displayedName == null) {
    return null;
  }

  if (typeof displayedName !== 'string') {
    return 'Displayed name must be a string';
  }

  if (
    displayedName.length < DISPLAY_NAME_MIN_LENGTH ||
    displayedName.length > DISPLAY_NAME_MAX_LENGTH
  ) {
    return 'Displayed name must be between 3 and 20 characters';
  }

  if (!DISPLAY_NAME_PATTERN.test(displayedName)) {
    return 'Displayed name may contain letters, numbers, "_", "-", "(", ")" and single spaces between characters';
  }

  return null;
};

export const validatePassword = (password) => {
  if (typeof password !== 'string') {
    return 'Password is required';
  }

  const digitMatches = password.match(/\d/g) || [];

  if (password.length < 5 || digitMatches.length < 3) {
    return 'Password must be at least 5 characters and include at least 3 digits';
  }

  return null;
};
