import Head from "next/head";
import "@/styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>SpiceDB UI</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
