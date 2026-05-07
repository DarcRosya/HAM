export const authService = {
    login: async ({ email, password }) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const res = {
            token: "login-token",
            user: { email }
          };
  
          localStorage.setItem("token", res.token);
  
          resolve(res);
        }, 500);
      });
    },
  
    register: async ({ email, password }) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const res = {
            token: "register-token",
            user: { email }
          };
  
          localStorage.setItem("token", res.token);
  
          resolve(res);
        }, 500);
      });
    }
};
