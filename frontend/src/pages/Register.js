import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('worker');
  const [loading, setLoading] = useState(false);
  const { register, error, setError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await register(email, password, name, role);
      if (user.role === 'admin') {
        navigate('/dashboard');
      } else {
        navigate('/worker');
      }
    } catch (err) {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 bg-[#F4F4F6]">
        <div className="max-w-md w-full">
          <div className="bg-white border border-[#E5E5E5] p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-black tracking-tighter mb-2" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Create Account</h1>
              <p className="text-sm text-[#737373]">Register for warehouse access</p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-[#FF3B30] text-white text-sm border border-[#E5E5E5]" data-testid="register-error-message">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} data-testid="register-form">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full border-[#E5E5E5] rounded-none h-11"
                    data-testid="register-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Username or Email</Label>
                  <Input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full border-[#E5E5E5] rounded-none h-11"
                    data-testid="register-email-input"
                  />
                </div>
                <div>
                  <Label htmlFor="password" className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full border-[#E5E5E5] rounded-none h-11"
                    data-testid="register-password-input"
                  />
                </div>
                <div>
                  <Label htmlFor="role" className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="w-full border-[#E5E5E5] rounded-none h-11" data-testid="register-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">Worker</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full mt-6 bg-[#002FA7] hover:bg-[#001F70] text-white font-semibold h-11 rounded-none"
                data-testid="register-submit-button"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/login" className="text-sm text-[#002FA7] hover:underline" data-testid="login-link">
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div 
        className="hidden lg:block lg:flex-1 bg-cover bg-center" 
        style={{backgroundImage: `url('https://static.prod-images.emergentagent.com/jobs/86b066e6-16cc-4b95-86c1-8aeb1025cdaf/images/a0a5342a7d30a1821e3fe20f49f9b9c32f8a51eb09da10083c23e3fefc2f7a76.png')`}}
      />
    </div>
  );
};
