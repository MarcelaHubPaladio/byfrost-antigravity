import { useParams } from "react-router-dom";

export default function TvPlayer() {
    const { pointId } = useParams();

    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-black text-white">
            <h1 className="text-3xl font-bold">TV Player</h1>
            <p className="mt-4 text-lg">Ponto: {pointId}</p>
            {/* Temporary Placeholder */}
        </div>
    );
}
