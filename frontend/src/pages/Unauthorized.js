export const Unauthorized = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F4F6]">
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tighter mb-4" style={{fontFamily: 'Cabinet Grotesk, sans-serif'}}>Unauthorized</h1>
        <p className="text-[#737373] mb-6">You don't have permission to access this page.</p>
        <a href="/login" className="text-[#002FA7] underline">Go to Login</a>
      </div>
    </div>
  );
};
