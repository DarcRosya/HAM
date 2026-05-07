import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/auth";

export default function Login() {
  const [formData, setFormData] = useState({
    identifier: "",
    password: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await authService.login({
        identifier: formData.identifier,
        password: formData.password
      });
      localStorage.setItem("token", res.token);
      navigate("/lobby");
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <h2>Login</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="identifier">Username or email</label>
          <br/>
          <input
            id="identifier"
            type="text"
            value={formData.identifier}
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

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Logging in..." : "Login"}
        </button>
      </form>

      <p>
        Don't have an account? <a href="/register">Register</a>
      </p>
    </div>
  );
}