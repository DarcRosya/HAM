import { createUser, findByUsername } from '../repositories/userRepository.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { generateToken } from '../utils/jwt.js';

export async function registerUser({ username, password }) {
	const existingUser = await findByUsername(username);

	if (existingUser) {
		const error = new Error('Username already exists');
		error.status = 409;
		throw error;
	}

	const passwordHash = await hashPassword(password);
	const user = await createUser({ username, passwordHash });

	return { id: user.id, username: user.username };
}

export async function loginUser({ username, password }) {
	const user = await findByUsername(username);

	if (!user) {
		const error = new Error('Invalid credentials');
		error.status = 401;
		throw error;
	}

	const isValid = await verifyPassword(password, user.passwordHash);

	if (!isValid) {
		const error = new Error('Invalid credentials');
		error.status = 401;
		throw error;
	}

	const token = generateToken(user.id, user.username);

	return {
		token,
		user: {
			id: user.id,
			username: user.username,
		},
	};
}
