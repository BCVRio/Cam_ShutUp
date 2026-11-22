#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StreetLife.generated.h"

class USkeletalMeshComponent; class UStaticMeshComponent; class UBlendSpace; class UAnimSequence; class USoundBase; class UStaticMesh; class USceneComponent;

// A polyline from world.json (a road centreline or a pavement edge), in level centimetres, with cumulative lengths.
USTRUCT()
struct FStreetPath
{
	GENERATED_BODY()
	TArray<FVector> Pts; TArray<float> Cum; float Len = 0.f; float Width = 0.f; int32 Road = -1; int32 Side = 0;
	FVector At(float S, int32 Dir, FVector2D* OutDir = nullptr) const;
};

// Someone walking the pavement: a skinned mesh that blends idle and walk by speed; moved by the StreetLife manager.
UCLASS()
class NUNHEADGTA_API AStreetWalker : public AActor
{
	GENERATED_BODY()
public:
	AStreetWalker();
	UPROPERTY(VisibleAnywhere) USkeletalMeshComponent* Mesh;
	void Dress(const FString& MeshPath, float HeightCm, bool bUseBlendSpace);
	void SetSpeed(float CmPerSec);
	int32 Path = -1; int32 Dir = 1; float S = 0.f; float Speed = 130.f; bool bWalking = true;
private:
	UPROPERTY() UBlendSpace* Blend = nullptr; UPROPERTY() UAnimSequence* IdleClip = nullptr; UPROPERTY() UAnimSequence* WalkClip = nullptr; UPROPERTY() UAnimSequence* Current = nullptr;
};

// A car that drives on the left and brakes for anyone in the road ahead. Its body is every static mesh under a folder
// (the browser props come in as a few meshes each), nosed along +X.
UCLASS()
class NUNHEADGTA_API AStreetCar : public AActor
{
	GENERATED_BODY()
public:
	AStreetCar();
	UPROPERTY(VisibleAnywhere) USceneComponent* Root;
	void Body(const FString& Folder, float YawFix);
	int32 Road = -1; int32 Dir = 1; float S = 0.f; float V = 0.f; float VMax = 700.f; bool bPassed = false;
	FVector2D Pos = FVector2D::ZeroVector; FVector2D Fwd = FVector2D(1, 0);
};

// A cat that sits by the kerb, wanders, and miaows at Cam.
UCLASS()
class NUNHEADGTA_API AStreetCat : public AActor
{
	GENERATED_BODY()
public:
	AStreetCat();
	UPROPERTY(VisibleAnywhere) UStaticMeshComponent* Mesh;
	void Dress(const FString& MeshPath, float LengthCm);
	int32 Road = -1; int32 Dir = 1; float S = 0.f; int32 Side = 1; bool bWalking = false; float Timer = 3.f; float MeowCool = 0.f; FVector2D Pos = FVector2D::ZeroVector;
};

// Birds: a flock circling over a green, or pigeons on the grass that scatter when Cam runs at them.
UCLASS()
class NUNHEADGTA_API ABirdFlock : public AActor
{
	GENERATED_BODY()
public:
	ABirdFlock();
	UPROPERTY(VisibleAnywhere) USceneComponent* Root;
	void Build(UStaticMesh* BodyMesh, UStaticMesh* WingMesh, int32 Count, bool bPigeons, const FVector& Centre, float Height);
	void Step(float Dt, float T, const FVector& Player, USoundBase* Scatter);
	bool bPigeons = false; FVector Centre = FVector::ZeroVector; float Height = 0.f; float Radius = 1800.f; float Phase = 0.f; float Speed = 0.4f; float Up = 0.f;
private:
	struct FBird { UStaticMeshComponent* Body; UStaticMeshComponent* L; UStaticMeshComponent* R; FVector Off; float Flap; FVector Ground; float H; float Yaw; };
	TArray<FBird> Birds;
	UStaticMeshComponent* Part(UStaticMesh* M, const FString& Name);
};

// The street-life manager: reads world.json (the exporter's roads, pavements and areas), spawns walkers, cars, cats
// and birds around Cam, moves them every tick and recycles whatever drifts too far. One per level.
UCLASS(Config=Game)
class NUNHEADGTA_API AStreetLife : public AActor
{
	GENERATED_BODY()
public:
	AStreetLife();
	// the exporter's JSON; the level builder sets the absolute path, else the project folder is searched
	UPROPERTY(EditAnywhere, Category="Street") FString WorldJson;
	UPROPERTY(EditAnywhere, Category="Street") int32 Walkers = 18;
	UPROPERTY(EditAnywhere, Category="Street") int32 Cars = 6;
	UPROPERTY(EditAnywhere, Category="Street") int32 Cats = 4;
	UPROPERTY(EditAnywhere, Category="Street") int32 Flocks = 4;
	UPROPERTY(Config) FString ManMeshPath; UPROPERTY(Config) FString WomanMeshPath; UPROPERTY(Config) FString HatchbackFolder; UPROPERTY(Config) FString VanFolder;
	UPROPERTY(Config) FString CatMeshPath; UPROPERTY(Config) FString BirdFolder;
	UPROPERTY(Config) FString CarPassSoundPath; UPROPERTY(Config) FString MeowSoundPath; UPROPERTY(Config) FString PigeonsSoundPath;
	UPROPERTY(Config) float CarYawFix = 180.f;
	UPROPERTY(Config) bool bUseBlendSpace = false;   // see BotPlayer: clips switch instead
	// testing aid: seconds after start to move Cam beside the pedestrian nearest a car, so the game mode's auto screenshot
	// shows the street (0 = never); -ini:Game:[/Script/NunheadGTA.StreetLife]:PhotoSeconds=22
	UPROPERTY(Config) float PhotoSeconds = 0.f;
	UPROPERTY(BlueprintReadOnly, Category="Street") int32 RoadCount = 0;
	UPROPERTY(BlueprintReadOnly, Category="Street") int32 PavementCount = 0;
protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
private:
	bool LoadWorld();
	void SpawnAll(const FVector& Near);
	void StepWalker(AStreetWalker* W, float Dt, const FVector& P);
	void StepCar(AStreetCar* C, float Dt, const FVector& P);
	void StepCat(AStreetCat* K, float Dt, float T, const FVector& P);
	int32 PickPath(const TArray<FStreetPath>& Paths, const FVector& Near, float Radius, float MinW, float MaxW, float MinLen = 0.f) const;
	int32 NextRoad(int32 Road, int32 End, float MinW, float MaxW, int32& OutDir) const;
	int32 NextPavement(int32 Pav, const FVector& End, int32& OutDir) const;
	TArray<FStreetPath> Roads; TArray<FStreetPath> Pavements;
	TArray<FVector> Greens; TArray<FVector> PigeonSpots;
	UPROPERTY() TArray<AStreetWalker*> Walkerz; UPROPERTY() TArray<AStreetCar*> Carz; UPROPERTY() TArray<AStreetCat*> Catz; UPROPERTY() TArray<ABirdFlock*> Birdz;
	UPROPERTY() USoundBase* CarPass = nullptr; UPROPERTY() USoundBase* Meow = nullptr; UPROPERTY() USoundBase* Pigeons = nullptr;
	UPROPERTY() UStaticMesh* BirdBodyDark = nullptr; UPROPERTY() UStaticMesh* BirdWingDark = nullptr; UPROPERTY() UStaticMesh* BirdBodyGrey = nullptr; UPROPERTY() UStaticMesh* BirdWingGrey = nullptr;
	bool bLoaded = false; bool bSpawned = false; bool bPhotoDone = false; float RecycleT = 0.f; float Clock = 0.f;
	FRandomStream Rnd;
};
