#include "StreetLife.h"
#include "NunheadGTA.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"

// ---------------------------------------------------------------------------------------------------------------------
// helpers
static float Dist2D(const FVector& A, const FVector& B) { return FVector::Dist2D(A, B); }
static float YawOf(const FVector2D& D) { return FMath::RadiansToDegrees(FMath::Atan2(D.Y, D.X)); }

// every static mesh under a content folder (the browser props import as one mesh per part), optionally by name
static TArray<UStaticMesh*> MeshesUnder(const FString& Folder, const FString& NameContains = TEXT(""))
{
	TArray<UStaticMesh*> Out;
	IAssetRegistry& AR = FAssetRegistryModule::GetRegistry();
	AR.ScanPathsSynchronous({ Folder }, true);     // the registry may still be scanning when the level starts
	TArray<FAssetData> Assets; AR.GetAssetsByPath(FName(*Folder), Assets, true);
	for (const FAssetData& A : Assets)
	{
		if (A.AssetClassPath != UStaticMesh::StaticClass()->GetClassPathName()) continue;
		if (!NameContains.IsEmpty() && !A.AssetName.ToString().Contains(NameContains)) continue;
		if (UStaticMesh* M = Cast<UStaticMesh>(A.GetAsset())) Out.Add(M);
	}
	return Out;
}
static UStaticMesh* MeshAt(const FString& PathOrFolder, const FString& NameContains = TEXT(""))
{
	if (UStaticMesh* M = LoadObject<UStaticMesh>(nullptr, *PathOrFolder)) return M;
	TArray<UStaticMesh*> All = MeshesUnder(PathOrFolder, NameContains);
	return All.Num() ? All[0] : nullptr;
}

FVector FStreetPath::At(float S, int32 Dir, FVector2D* OutDir) const
{
	const int32 N = Pts.Num();
	if (N == 0) { if (OutDir) *OutDir = FVector2D(1, 0); return FVector::ZeroVector; }
	if (N == 1) { if (OutDir) *OutDir = FVector2D(1, 0); return Pts[0]; }
	const float D = FMath::Clamp(Dir > 0 ? S : Len - S, 0.f, Len);
	int32 i = 1; while (i < N - 1 && Cum[i] < D) ++i;
	const float SegLen = Cum[i] - Cum[i - 1];
	const float T = SegLen > 0.f ? (D - Cum[i - 1]) / SegLen : 0.f;
	const FVector A = Pts[i - 1], B = Pts[i];
	FVector2D Dd = FVector2D(B.X - A.X, B.Y - A.Y).GetSafeNormal(); if (Dir < 0) Dd = -Dd;
	if (OutDir) *OutDir = Dd.IsNearlyZero() ? FVector2D(1, 0) : Dd;
	return A + (B - A) * T;
}

// ---------------------------------------------------------------------------------------------------------------------
// walker
AStreetWalker::AStreetWalker()
{
	PrimaryActorTick.bCanEverTick = false;
	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh")); SetRootComponent(Mesh);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetRelativeRotation(FRotator(0, -90.f, 0));
}
void AStreetWalker::Dress(const FString& MeshPath, float HeightCm)
{
	USkeletalMesh* SM = LoadObject<USkeletalMesh>(nullptr, *MeshPath);
	if (!SM) { UE_LOG(LogNunhead, Warning, TEXT("Walker mesh not found at %s"), *MeshPath); return; }
	Mesh->SetSkeletalMesh(SM);
	const float H = SM->GetBounds().BoxExtent.Z * 2.f; if (H > 10.f) Mesh->SetRelativeScale3D(FVector(HeightCm / H));
	Mesh->SetAnimationMode(EAnimationMode::AnimationSingleNode);
	Blend = LoadObject<UBlendSpace>(nullptr, *(MeshPath + TEXT("_BS")));
	if (Blend) { Mesh->SetAnimation(Blend); Mesh->Play(true); }
	else if (UAnimSequence* Walk = LoadObject<UAnimSequence>(nullptr, *(MeshPath + TEXT("_Anim_walk")))) Mesh->PlayAnimation(Walk, true);
}
void AStreetWalker::SetSpeed(float V)
{
	if (Blend) if (UAnimSingleNodeInstance* N = Mesh->GetSingleNodeInstance()) N->SetBlendSpacePosition(FVector(V, 0, 0));
}

// ---------------------------------------------------------------------------------------------------------------------
// car
AStreetCar::AStreetCar()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root")); SetRootComponent(Root);
}
void AStreetCar::Body(const FString& Folder, float YawFix)
{
	int32 N = 0;
	for (UStaticMesh* M : MeshesUnder(Folder))
	{
		UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
		C->SetStaticMesh(M); C->SetupAttachment(Root); C->SetRelativeRotation(FRotator(0, YawFix, 0));
		C->SetMobility(EComponentMobility::Movable); C->SetCollisionProfileName(TEXT("BlockAll")); C->RegisterComponent(); ++N;
	}
	if (N == 0) UE_LOG(LogNunhead, Warning, TEXT("No car meshes under %s"), *Folder);
}

// ---------------------------------------------------------------------------------------------------------------------
// cat
AStreetCat::AStreetCat()
{
	PrimaryActorTick.bCanEverTick = false;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh")); SetRootComponent(Mesh);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
void AStreetCat::Dress(const FString& MeshPath, float LengthCm)
{
	UStaticMesh* M = MeshAt(MeshPath);
	if (!M) { UE_LOG(LogNunhead, Warning, TEXT("Cat mesh not found at %s"), *MeshPath); return; }
	Mesh->SetStaticMesh(M);
	const FVector E = M->GetBounds().BoxExtent; const float L = 2.f * FMath::Max(E.X, E.Y);
	if (L > 1.f) Mesh->SetRelativeScale3D(FVector(LengthCm / L));
	Mesh->SetRelativeLocation(FVector(0, 0, -M->GetBounds().Origin.Z * (L > 1.f ? LengthCm / L : 1.f) + E.Z * (L > 1.f ? LengthCm / L : 1.f)));
}

// ---------------------------------------------------------------------------------------------------------------------
// birds
ABirdFlock::ABirdFlock()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root")); SetRootComponent(Root);
}
UStaticMeshComponent* ABirdFlock::Part(UStaticMesh* M, const FString& Name)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this, *Name);
	C->SetStaticMesh(M); C->SetupAttachment(Root); C->SetCollisionEnabled(ECollisionEnabled::NoCollision); C->SetCastShadow(false);
	C->SetMobility(EComponentMobility::Movable); C->RegisterComponent(); return C;
}
void ABirdFlock::Build(UStaticMesh* BodyMesh, UStaticMesh* WingMesh, int32 Count, bool bInPigeons, const FVector& InCentre, float InHeight)
{
	bPigeons = bInPigeons; Centre = InCentre; Height = InHeight; SetActorLocation(Centre);
	for (int32 i = 0; i < Count; ++i)
	{
		FBird B;
		B.Body = Part(BodyMesh, FString::Printf(TEXT("Body%d"), i));
		B.L = Part(WingMesh, FString::Printf(TEXT("WingL%d"), i)); B.L->AttachToComponent(B.Body, FAttachmentTransformRules::KeepRelativeTransform);
		B.R = Part(WingMesh, FString::Printf(TEXT("WingR%d"), i)); B.R->AttachToComponent(B.Body, FAttachmentTransformRules::KeepRelativeTransform); B.R->SetRelativeScale3D(FVector(1, -1, 1));
		B.Off = FVector(FMath::FRandRange(-1.f, 1.f), FMath::FRandRange(-1.f, 1.f), FMath::FRandRange(-1.f, 1.f)); B.Flap = FMath::FRand() * 6.f; B.H = 0.f; B.Yaw = FMath::FRand() * 360.f;
		B.Ground = Centre + FVector(FMath::FRandRange(-300.f, 300.f), FMath::FRandRange(-300.f, 300.f), 5.f);
		if (bPigeons) { B.Body->SetWorldLocation(B.Ground); B.Body->SetWorldRotation(FRotator(0, B.Yaw, 0)); B.L->SetRelativeRotation(FRotator(0, 0, 11.f)); B.R->SetRelativeRotation(FRotator(0, 0, -11.f)); }
		Birds.Add(B);
	}
}
void ABirdFlock::Step(float Dt, float T, const FVector& Player, USoundBase* Scatter)
{
	if (!bPigeons)
	{
		for (FBird& B : Birds)
		{
			const float A = T * Speed + Phase + B.Off.X * 0.5f; const float R = Radius + B.Off.Y * 400.f;
			B.Body->SetWorldLocation(Centre + FVector(FMath::Cos(A) * R, FMath::Sin(A) * R, Height + B.Off.Z * 300.f + FMath::Sin(T * 0.7f + B.Off.X) * 150.f));
			B.Body->SetWorldRotation(FRotator(0, FMath::RadiansToDegrees(A) + 90.f, 0));
			const float Fl = FMath::RadiansToDegrees(FMath::Sin(T * 9.f + B.Flap) * 0.7f);
			B.L->SetRelativeRotation(FRotator(0, 0, Fl)); B.R->SetRelativeRotation(FRotator(0, 0, -Fl));
		}
		return;
	}
	const float D = Dist2D(Centre, Player);
	if (D < 700.f && Up <= 0.f) { Up = 6.f; if (Scatter) UGameplayStatics::PlaySoundAtLocation(this, Scatter, Centre, 0.5f); }
	if (Up > 0.f)
	{
		Up -= Dt;
		for (FBird& B : Birds)
		{
			B.H = FMath::Min(800.f, B.H + Dt * 600.f);
			const float A = T * 1.5f + B.Ground.X * 0.01f;
			B.Body->SetWorldLocation(B.Ground + FVector(FMath::Cos(A) * B.H * 0.8f, FMath::Sin(A) * B.H * 0.8f, B.H));
			B.Body->SetWorldRotation(FRotator(0, FMath::RadiansToDegrees(A) + 90.f, 0));
			const float Fl = FMath::RadiansToDegrees(FMath::Sin(T * 12.f + B.Ground.X) * 0.8f);
			B.L->SetRelativeRotation(FRotator(0, 0, Fl)); B.R->SetRelativeRotation(FRotator(0, 0, -Fl));
		}
		return;
	}
	for (FBird& B : Birds)
	{
		if (B.H > 0.f)
		{
			B.H = FMath::Max(0.f, B.H - Dt * 300.f);
			B.Body->SetWorldLocation(B.Ground + FVector(0, 0, B.H));
			if (B.H <= 0.f) { B.L->SetRelativeRotation(FRotator(0, 0, 11.f)); B.R->SetRelativeRotation(FRotator(0, 0, -11.f)); B.Body->SetWorldRotation(FRotator(0, B.Yaw, 0)); }
		}
		else { B.Yaw += FMath::Sin(T * 0.8f + B.Ground.X) * Dt * 20.f; B.Body->SetWorldRotation(FRotator(0, B.Yaw, 0)); }
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// manager
AStreetLife::AStreetLife()
{
	PrimaryActorTick.bCanEverTick = true;
	Rnd.Initialize(1234);
}

void AStreetLife::BeginPlay()
{
	Super::BeginPlay();
	bLoaded = LoadWorld();
	CarPass = LoadObject<USoundBase>(nullptr, *CarPassSoundPath); Meow = LoadObject<USoundBase>(nullptr, *MeowSoundPath); Pigeons = LoadObject<USoundBase>(nullptr, *PigeonsSoundPath);
	auto Bird = [&](const TCHAR* Name) { TArray<UStaticMesh*> M = MeshesUnder(BirdFolder, Name); return M.Num() ? M[0] : nullptr; };
	BirdBodyDark = Bird(TEXT("body_dark")); BirdWingDark = Bird(TEXT("wing_dark")); BirdBodyGrey = Bird(TEXT("body_grey")); BirdWingGrey = Bird(TEXT("wing_grey"));
	if (!BirdBodyDark || !BirdWingDark) UE_LOG(LogNunhead, Warning, TEXT("Bird meshes not found under %s"), *BirdFolder);
}

bool AStreetLife::LoadWorld()
{
	FString Text, Used;
	for (const FString& C : { WorldJson, FPaths::ProjectDir() / TEXT("world.json"), FPaths::ProjectContentDir() / TEXT("Nunhead/world.json") })
		if (!C.IsEmpty() && FFileHelper::LoadFileToString(Text, *C)) { Used = C; break; }
	if (Text.IsEmpty()) { UE_LOG(LogNunhead, Warning, TEXT("StreetLife: world.json not found (WorldJson = %s)"), *WorldJson); return false; }
	TSharedPtr<FJsonObject> Root; TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) { UE_LOG(LogNunhead, Warning, TEXT("StreetLife: %s is not valid JSON"), *Used); return false; }
	// the exporter's frame is metres, Y up, x east, z south; Interchange put the meshes at (x, z, y) * 100
	auto ToUE = [](const TArray<TSharedPtr<FJsonValue>>& P) { return FVector(P[0]->AsNumber() * 100.0, P[2]->AsNumber() * 100.0, P[1]->AsNumber() * 100.0); };
	auto ReadPath = [&](const TSharedPtr<FJsonObject>& O, FStreetPath& Out)
	{
		const TArray<TSharedPtr<FJsonValue>>* Pts = nullptr;
		if (!O->TryGetArrayField(TEXT("points"), Pts)) return false;
		for (const TSharedPtr<FJsonValue>& V : *Pts) { const TArray<TSharedPtr<FJsonValue>>& P = V->AsArray(); if (P.Num() >= 3) Out.Pts.Add(ToUE(P)); }
		if (Out.Pts.Num() < 2) return false;
		Out.Cum.Add(0.f);
		for (int32 i = 1; i < Out.Pts.Num(); ++i) Out.Cum.Add(Out.Cum.Last() + Dist2D(Out.Pts[i], Out.Pts[i - 1]));
		Out.Len = Out.Cum.Last();
		return Out.Len > 1.f;
	};
	const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
	if (Root->TryGetArrayField(TEXT("roads"), Arr))
		for (const TSharedPtr<FJsonValue>& V : *Arr)
		{
			const TSharedPtr<FJsonObject>& O = V->AsObject(); FStreetPath R;
			R.Width = O->GetNumberField(TEXT("width")) * 100.0; R.Road = Roads.Num();
			if (!ReadPath(O, R)) R.Len = 0.f;     // keep the slot: pavements refer to roads by index
			Roads.Add(R);
		}
	if (Root->TryGetArrayField(TEXT("pavements"), Arr))
		for (const TSharedPtr<FJsonValue>& V : *Arr)
		{
			const TSharedPtr<FJsonObject>& O = V->AsObject(); FStreetPath P;
			P.Width = O->GetNumberField(TEXT("width")) * 100.0; P.Road = O->GetIntegerField(TEXT("road")); P.Side = O->GetIntegerField(TEXT("side"));
			if (ReadPath(O, P)) Pavements.Add(P);
		}
	if (Root->TryGetArrayField(TEXT("areas"), Arr))
		for (const TSharedPtr<FJsonValue>& V : *Arr)
		{
			const TSharedPtr<FJsonObject>& O = V->AsObject(); const TSharedPtr<FJsonObject>* C = nullptr;
			if (!O->TryGetObjectField(TEXT("centre"), C)) continue;
			const FVector G((*C)->GetNumberField(TEXT("x")) * 100.0, (*C)->GetNumberField(TEXT("z")) * 100.0, O->GetNumberField(TEXT("groundY")) * 100.0);
			const FString Id = O->GetStringField(TEXT("id"));
			if (Id != TEXT("streets")) Greens.Add(G);
			if (Id == TEXT("nunhead") || Id == TEXT("park")) PigeonSpots.Add(G + FVector(-1200.f, 600.f, 0.f));
		}
	RoadCount = Roads.Num(); PavementCount = Pavements.Num();
	UE_LOG(LogNunhead, Log, TEXT("StreetLife: %d roads, %d pavements, %d greens from %s"), RoadCount, PavementCount, Greens.Num(), *Used);
	return RoadCount > 0;
}

int32 AStreetLife::PickPath(const TArray<FStreetPath>& Paths, const FVector& Near, float Radius, float MinW, float MaxW, float MinLen) const
{
	TArray<int32> C;
	for (int32 i = 0; i < Paths.Num(); ++i)
	{
		const FStreetPath& P = Paths[i];
		if (P.Len < FMath::Max(MinLen, 1.f) || P.Width < MinW || P.Width > MaxW) continue;
		if (Dist2D(P.Pts[0], Near) < Radius) C.Add(i);
	}
	return C.Num() ? C[FMath::Min(C.Num() - 1, (int32)(const_cast<FRandomStream&>(Rnd).FRand() * C.Num()))] : -1;
}

int32 AStreetLife::NextRoad(int32 Road, int32 End, float MinW, float MaxW, int32& OutDir) const
{
	const FStreetPath& R = Roads[Road]; const FVector E = End == 0 ? R.Pts[0] : R.Pts.Last();
	TArray<TPair<int32, int32>> C;
	for (int32 j = 0; j < Roads.Num(); ++j)
	{
		const FStreetPath& Q = Roads[j]; if (j == Road || Q.Len <= 1.f || Q.Width < MinW || Q.Width > MaxW) continue;
		if (Dist2D(Q.Pts[0], E) < 600.f) C.Add(TPair<int32, int32>(j, 1));
		if (Dist2D(Q.Pts.Last(), E) < 600.f) C.Add(TPair<int32, int32>(j, -1));
	}
	if (!C.Num()) return -1;
	const TPair<int32, int32>& Pick = C[FMath::Min(C.Num() - 1, (int32)(const_cast<FRandomStream&>(Rnd).FRand() * C.Num()))];
	OutDir = Pick.Value; return Pick.Key;
}

int32 AStreetLife::NextPavement(int32 Pav, const FVector& End, int32& OutDir) const
{
	TArray<TPair<int32, int32>> C;
	for (int32 j = 0; j < Pavements.Num(); ++j)
	{
		if (j == Pav) continue; const FStreetPath& Q = Pavements[j];
		if (Dist2D(Q.Pts[0], End) < 800.f) C.Add(TPair<int32, int32>(j, 1));
		if (Dist2D(Q.Pts.Last(), End) < 800.f) C.Add(TPair<int32, int32>(j, -1));
	}
	if (!C.Num()) return -1;
	const TPair<int32, int32>& Pick = C[FMath::Min(C.Num() - 1, (int32)(const_cast<FRandomStream&>(Rnd).FRand() * C.Num()))];
	OutDir = Pick.Value; return Pick.Key;
}

void AStreetLife::SpawnAll(const FVector& Near)
{
	UWorld* W = GetWorld(); if (!W) return;
	FActorSpawnParameters SP; SP.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	for (int32 i = 0; i < Walkers; ++i)
	{
		const int32 P = PickPath(Pavements, Near, 14000.f, 0.f, 1e9f); if (P < 0) break;
		AStreetWalker* A = W->SpawnActor<AStreetWalker>(AStreetWalker::StaticClass(), FTransform::Identity, SP); if (!A) break;
		A->Dress(Rnd.FRand() < 0.5f ? ManMeshPath : WomanMeshPath, 175.f);
		A->Path = P; A->Dir = Rnd.FRand() < 0.5f ? 1 : -1; A->S = Rnd.FRand() * Pavements[P].Len; A->Speed = 115.f + Rnd.FRand() * 50.f;
		FVector2D Dd; const FVector L = Pavements[P].At(A->S, A->Dir, &Dd); A->SetActorLocationAndRotation(L, FRotator(0, YawOf(Dd), 0));
		Walkerz.Add(A);
	}
	for (int32 i = 0; i < Cars; ++i)
	{
		const int32 R = PickPath(Roads, Near, 22000.f, 500.f, 1200.f, 3000.f); if (R < 0) break;
		AStreetCar* A = W->SpawnActor<AStreetCar>(AStreetCar::StaticClass(), FTransform::Identity, SP); if (!A) break;
		A->Body(Rnd.FRand() < 0.8f ? HatchbackFolder : VanFolder, CarYawFix);
		A->Road = R; A->Dir = Rnd.FRand() < 0.5f ? 1 : -1; A->S = Rnd.FRand() * Roads[R].Len; A->VMax = 600.f + Rnd.FRand() * 300.f;
		Carz.Add(A);
	}
	for (int32 i = 0; i < Cats; ++i)
	{
		const int32 R = PickPath(Roads, Near, 16000.f, 300.f, 1200.f); if (R < 0) break;
		AStreetCat* A = W->SpawnActor<AStreetCat>(AStreetCat::StaticClass(), FTransform::Identity, SP); if (!A) break;
		A->Dress(CatMeshPath, 55.f);
		A->Road = R; A->Dir = 1; A->S = Rnd.FRand() * Roads[R].Len; A->Side = Rnd.FRand() < 0.5f ? 1 : -1; A->Timer = 2.f + Rnd.FRand() * 6.f;
		Catz.Add(A);
	}
	if (BirdBodyDark && BirdWingDark)
		for (int32 i = 0; i < FMath::Min(Flocks, Greens.Num()); ++i)
		{
			ABirdFlock* F = W->SpawnActor<ABirdFlock>(ABirdFlock::StaticClass(), FTransform::Identity, SP); if (!F) break;
			F->Radius = 1400.f + Rnd.FRand() * 1200.f; F->Phase = Rnd.FRand() * 6.28f; F->Speed = 0.35f + Rnd.FRand() * 0.2f;
			F->Build(BirdBodyDark, BirdWingDark, 6 + (int32)(Rnd.FRand() * 5), false, Greens[i], 1800.f + Rnd.FRand() * 1000.f);
			Birdz.Add(F);
		}
	if (BirdBodyGrey && BirdWingGrey)
		for (const FVector& S : PigeonSpots)
		{
			ABirdFlock* F = W->SpawnActor<ABirdFlock>(ABirdFlock::StaticClass(), FTransform::Identity, SP); if (!F) break;
			F->Build(BirdBodyGrey, BirdWingGrey, 5, true, S, 0.f);
			Birdz.Add(F);
		}
	UE_LOG(LogNunhead, Log, TEXT("StreetLife: %d walkers, %d cars, %d cats, %d flocks"), Walkerz.Num(), Carz.Num(), Catz.Num(), Birdz.Num());
}

void AStreetLife::StepWalker(AStreetWalker* Wk, float Dt, const FVector& P)
{
	if (!Pavements.IsValidIndex(Wk->Path)) return;
	const FVector Loc = Wk->GetActorLocation();
	const bool bFacing = Dist2D(Loc, P) < 160.f; bool bBlocked = bFacing;
	if (!bBlocked) for (AStreetCar* C : Carz) if (Dist2D(Loc, C->GetActorLocation()) < 320.f) { bBlocked = true; break; }
	if (bBlocked)
	{
		Wk->SetSpeed(0.f);
		if (bFacing) Wk->SetActorRotation(FRotator(0, YawOf(FVector2D(P.X - Loc.X, P.Y - Loc.Y)), 0));
		return;
	}
	Wk->SetSpeed(Wk->Speed); Wk->S += Wk->Speed * Dt;
	if (Wk->S >= Pavements[Wk->Path].Len)
	{
		const FVector End = Pavements[Wk->Path].At(Pavements[Wk->Path].Len, Wk->Dir);
		int32 Nd = 1; const int32 Np = NextPavement(Wk->Path, End, Nd);
		if (Np >= 0) { Wk->Path = Np; Wk->Dir = Nd; } else Wk->Dir = -Wk->Dir;
		Wk->S = 0.f;
	}
	FVector2D Dd; const FVector L = Pavements[Wk->Path].At(Wk->S, Wk->Dir, &Dd);
	Wk->SetActorLocationAndRotation(L, FRotator(0, YawOf(Dd), 0));
}

void AStreetLife::StepCar(AStreetCar* C, float Dt, const FVector& P)
{
	if (!Roads.IsValidIndex(C->Road)) return;
	// anything in the road ahead: Cam, walkers, other cars, cats; brake and wait
	auto AheadOf = [&](const FVector& X, float Range, float Half) { const FVector2D R(X.X - C->Pos.X, X.Y - C->Pos.Y); const float F = R.X * C->Fwd.X + R.Y * C->Fwd.Y, S = -R.X * C->Fwd.Y + R.Y * C->Fwd.X; return F > -100.f && F < Range && FMath::Abs(S) < Half; };
	bool bStop = AheadOf(P, 900.f, 260.f);
	if (!bStop) for (AStreetWalker* Wk : Walkerz) if (AheadOf(Wk->GetActorLocation(), 800.f, 240.f)) { bStop = true; break; }
	if (!bStop) for (AStreetCar* O : Carz) if (O != C && AheadOf(O->GetActorLocation(), 700.f, 160.f)) { bStop = true; break; }
	if (!bStop) for (AStreetCat* K : Catz) if (AheadOf(K->GetActorLocation(), 700.f, 240.f)) { bStop = true; break; }
	const float Target = bStop ? 0.f : C->VMax;
	C->V += (Target - C->V) * FMath::Min(1.f, (bStop ? 4.f : 1.2f) * Dt);
	if (C->V < 5.f) C->V = 0.f;
	C->S += C->V * Dt;
	if (C->S >= Roads[C->Road].Len)
	{
		int32 Nd = 1; const int32 Nr = NextRoad(C->Road, C->Dir > 0 ? 1 : 0, 500.f, 1200.f, Nd);
		if (Nr >= 0) { C->Road = Nr; C->Dir = Nd; } else C->Dir = -C->Dir;
		C->S = 0.f;
	}
	FVector2D Dd; const FVector Pt = Roads[C->Road].At(C->S, C->Dir, &Dd);
	const float Off = FMath::Min(160.f, Roads[C->Road].Width / 4.f);     // keep left
	C->Pos = FVector2D(Pt.X + Dd.Y * Off, Pt.Y - Dd.X * Off); C->Fwd = Dd;
	C->SetActorLocationAndRotation(FVector(C->Pos.X, C->Pos.Y, Pt.Z + 2.f), FRotator(0, YawOf(Dd), 0));
	const float D = Dist2D(FVector(C->Pos.X, C->Pos.Y, 0), FVector(P.X, P.Y, 0));
	if (D < 1400.f && C->V > 300.f && !C->bPassed) { C->bPassed = true; if (CarPass) UGameplayStatics::PlaySoundAtLocation(this, CarPass, C->GetActorLocation(), 0.5f); }
	else if (D > 3000.f) C->bPassed = false;
}

void AStreetLife::StepCat(AStreetCat* K, float Dt, float T, const FVector& P)
{
	if (!Roads.IsValidIndex(K->Road)) return;
	const FStreetPath& R = Roads[K->Road]; const float Pad = R.Width * 0.5f + 260.f;
	K->Timer -= Dt; K->MeowCool -= Dt;
	if (K->Timer <= 0.f) { K->bWalking = !K->bWalking; K->Timer = K->bWalking ? 4.f + Rnd.FRand() * 8.f : 3.f + Rnd.FRand() * 6.f; if (K->bWalking && Rnd.FRand() < 0.3f) K->Dir = -K->Dir; }
	const float D = Dist2D(K->GetActorLocation(), P);
	if (D < 220.f && K->MeowCool <= 0.f) { K->MeowCool = 12.f + Rnd.FRand() * 20.f; if (Meow) UGameplayStatics::PlaySoundAtLocation(this, Meow, K->GetActorLocation(), 0.6f); K->bWalking = true; K->Timer = 3.f; }
	if (K->bWalking) { K->S += 80.f * Dt; if (K->S >= R.Len) { K->Dir = -K->Dir; K->S = 0.f; } }
	FVector2D Dd; const FVector Pt = R.At(K->S, K->Dir, &Dd);
	K->Pos = FVector2D(Pt.X - Dd.Y * Pad * K->Side, Pt.Y + Dd.X * Pad * K->Side);
	K->SetActorLocation(FVector(K->Pos.X, K->Pos.Y, Pt.Z + 8.f));
	if (K->bWalking) K->SetActorRotation(FRotator(0, YawOf(Dd), 0));
	K->Mesh->SetRelativeRotation(FRotator(FMath::Sin(T * 2.5f + K->S * 0.01f) * (K->bWalking ? 2.f : 0.f), 0, 0));
}

void AStreetLife::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!bLoaded) return;
	APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0); if (!Pawn) return;
	const FVector P = Pawn->GetActorLocation(); Clock += Dt;
	if (!bSpawned) { SpawnAll(P); bSpawned = true; }
	RecycleT -= Dt;
	if (RecycleT <= 0.f)
	{
		RecycleT = 2.f;
		for (AStreetWalker* Wk : Walkerz) if (Dist2D(Wk->GetActorLocation(), P) > 22000.f)
		{
			const int32 Np = PickPath(Pavements, P, 12000.f, 0.f, 1e9f);
			if (Np >= 0) { Wk->Path = Np; Wk->S = Rnd.FRand() * Pavements[Np].Len; FVector2D Dd; const FVector L = Pavements[Np].At(Wk->S, Wk->Dir, &Dd); Wk->SetActorLocationAndRotation(L, FRotator(0, YawOf(Dd), 0)); }
		}
		for (AStreetCar* C : Carz) if (Dist2D(C->GetActorLocation(), P) > 32000.f)
		{
			const int32 Nr = PickPath(Roads, P, 20000.f, 500.f, 1200.f, 3000.f);
			if (Nr >= 0) { C->Road = Nr; C->S = Rnd.FRand() * Roads[Nr].Len; C->V = 0.f; }
		}
		for (AStreetCat* K : Catz) if (Dist2D(K->GetActorLocation(), P) > 22000.f)
		{
			const int32 Nr = PickPath(Roads, P, 14000.f, 300.f, 1200.f);
			if (Nr >= 0) { K->Road = Nr; K->S = Rnd.FRand() * Roads[Nr].Len; }
		}
	}
	for (AStreetWalker* Wk : Walkerz) { const bool bFar = Dist2D(Wk->GetActorLocation(), P) > 15000.f; Wk->SetActorHiddenInGame(bFar); if (!bFar) StepWalker(Wk, Dt, P); }
	for (AStreetCar* C : Carz) StepCar(C, Dt, P);
	for (AStreetCat* K : Catz) { const bool bFar = Dist2D(K->GetActorLocation(), P) > 12000.f; K->SetActorHiddenInGame(bFar); if (!bFar) StepCat(K, Dt, Clock, P); }
	for (ABirdFlock* F : Birdz) { const bool bFar = Dist2D(F->Centre, P) > 26000.f; F->SetActorHiddenInGame(bFar); if (!bFar) F->Step(Dt, Clock, P, Pigeons); }
}
