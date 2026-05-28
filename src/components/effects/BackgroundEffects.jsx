export default function BackgroundEffects() {
  return (
    <div className="fixed inset-0 -z-50 overflow-hidden bg-[#050505]">
      {/* Cinematic Gradient Base */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#1f5134_0%,#08110c_30%,#050505_60%,#000000_100%)]" />

      {/* Big Glowing Orb Left */}
      <div className="absolute top-[-200px] left-[-200px] w-[900px] h-[900px] rounded-full bg-green-500/20 blur-[180px]" />

      {/* Big Glowing Orb Right */}
      <div className="absolute bottom-[-250px] right-[-250px] w-[900px] h-[900px] rounded-full bg-emerald-400/20 blur-[200px]" />

      {/* Center Atmosphere */}
      <div className="absolute top-[20%] left-[35%] w-[500px] h-[500px] rounded-full bg-lime-300/10 blur-[120px]" />

      {/* Green Laser Line */}
      <div className="absolute left-1/2 top-0 h-full w-[1px] bg-gradient-to-b from-green-400/50 via-transparent to-transparent" />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,136,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,136,0.15) 1px, transparent 1px)
          `,
          backgroundSize: '70px 70px',
        }}
      />

      {/* Noise */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'url(https://grainy-gradients.vercel.app/noise.svg)',
        }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,rgba(0,0,0,0.7)_100%)]" />
    </div>
  )
}