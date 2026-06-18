import React, { createContext, useContext, useEffect, useState } from 'react';

type NetworkContextType = {
  isConnected: boolean;
};

const NetworkContext = createContext<NetworkContextType>({ isConnected: true });

export function NetworkProvider({ children, onConnect }: { children: React.ReactNode, onConnect?: () => void }) {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // Ping a reliable endpoint every 5 seconds to check actual internet connectivity
    // This avoids needing 'expo-network' which causes native module errors in Expo Go SDK 56
    let isMounted = true;
    let failCount = 0;
    let wasConnected = true;

    const checkNetwork = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
        
        await fetch('https://1.1.1.1', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (isMounted) {
          setIsConnected(true);
          failCount = 0;
          if (!wasConnected && onConnect) {
            onConnect();
          }
          wasConnected = true;
        }
      } catch (err) {
        if (isMounted) {
          failCount++;
          if (failCount >= 2) {
            setIsConnected(false);
            wasConnected = false;
          }
        }
      }
    };

    checkNetwork();
    const interval = setInterval(checkNetwork, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [onConnect]);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
