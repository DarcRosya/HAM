import { loginUser, registerUser } from '../services/authService.js';

const USERNAME_MIN_LENGTH = 4;
const USERNAME_MAX_LENGTH = 16;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const DISPLAY_NAME_MIN_LENGTH = 3;
const DISPLAY_NAME_MAX_LENGTH = 20;
const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_()\-]+(?: [A-Za-z0-9_()\-]+)*$/;

const validateUsername = (username) => {
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

const validateDisplayedName = (displayedName) => {
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

const validatePassword = (password) => {
  if (typeof password !== 'string') {
    return 'Password is required';
  }

  const digitMatches = password.match(/\d/g) || [];

  if (password.length < 5 || digitMatches.length < 3) {
    return 'Password must be at least 5 characters and include at least 3 digits';
  }

  return null;
};

export async function register(req, res) {
  const { username, email, password, displayedName, displayed_name, avatar } = req.body;
  const normalizedDisplayName = displayedName ?? displayed_name ?? null;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ message: usernameError });
  }

  const displayedNameError = validateDisplayedName(normalizedDisplayName);
  if (displayedNameError) {
    return res.status(400).json({ message: displayedNameError });
  }

  // const passwordError = validatePassword(password);
  // if (passwordError) {
  //   return res.status(400).json({ message: passwordError });
  // }

  try {
    await registerUser({
      username,
      email,
      password,
      displayedName: normalizedDisplayName,
      avatar,
    });
    return res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Server error' });
  }
}

export async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ message: usernameError });
  }

  // const passwordError = validatePassword(password);
  // if (passwordError) {
  //   return res.status(400).json({ message: passwordError });
  // }

  try {
    const payload = await loginUser({ username, password });
    return res.status(200).json(payload);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Server error' });
  }
}
