import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/auth";

export default function Register() {
  const [formData, setFormData] = useState({
    nickname: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const res = await authService.register({
        nickname: formData.nickname,
        username: formData.username,
        email: formData.email,
        password: formData.password
      });

      localStorage.setItem("token", res.token);
      navigate("/lobby");
    } catch (error) {
      console.error("Registration error:", error);
      alert("Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-page">
      <h2>Register</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="nickname">Nickname</label>
          <br/>
          <input
            id="nickname"
            type="text"
            value={formData.nickname}
            onChange={handleChange}
            required
          />
        </div>

        <br/>

        <div>
          <label htmlFor="username">Username</label>
          <br/>
          <input
            id="username"
            type="text"
            value={formData.username}
            onChange={handleChange}
            required
          />
        </div>

        <br/>

        <div>
          <label htmlFor="email">Email</label>
          <br/>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>

        <br/>

        <div>
          <label htmlFor="password">Password</label>
          <br/>
          <input
            id="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>

        <br/>

        <div>
          <label htmlFor="confirmPassword">Confirm password</label>
          <br/>
          <input
            id="confirmPassword"
            type="password"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>

        <br/>

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Loading..." : "Register"}
        </button>
      </form>

      <p>
        Already have an account? <a href="/login">Login</a>
      </p>
    </div>
  );
}
