#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Football.generated.h"

// A real ball: Chaos rigid body with Magnus lift (curl), rolling resistance and a bit of drag.
UCLASS()
class NUNHEADGTA_API AFootball : public AActor
{
	GENERATED_BODY()
public:
	AFootball();
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) class UStaticMeshComponent* Mesh;
	// cm-based tuning: Magnus force = Coefficient * mass * (omega x v)
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Ball") float MagnusCoefficient = 0.0022f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Ball") float RollingResistance = 0.6f;   // fraction of g while rolling
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Ball") float AirDrag = 0.00015f;         // per cm/s
	UPROPERTY(BlueprintReadOnly, Category="Ball") FVector SpawnPoint;
	UPROPERTY(BlueprintReadOnly, Category="Ball") FName LastKicker;   // "cam", "bot", "keeper"

	// Dir: unit direction (flattened), Power: cm/s, Curl: -1..1 (negative bends left), Loft: 0..1 adds lift
	UFUNCTION(BlueprintCallable, Category="Ball") void Kick(const FVector& Dir, float Power, float Curl, float Loft, FName Kicker);
	UFUNCTION(BlueprintCallable, Category="Ball") void ResetToSpawn();
	// drops the ball dead at a spot (a throw-in, a goal kick): no velocity, no spin, nobody's last touch
	UFUNCTION(BlueprintCallable, Category="Ball") void PlaceAt(const FVector& Location);
	UFUNCTION(BlueprintPure, Category="Ball") FVector GetVelocity2D() const;
	bool IsOnGround() const;
	// a player bumping into the ball nudges it, never fires it: contact with a character caps the speed
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Ball") float TouchSpeedCap = 900.f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Ball") float MaxSpeed = 3200.f;      // cm/s, just above the hardest kick
	virtual void Tick(float DeltaSeconds) override;
	virtual void BeginPlay() override;
	virtual void NotifyHit(UPrimitiveComponent* MyComp, AActor* Other, UPrimitiveComponent* OtherComp, bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse, const FHitResult& Hit) override;
};
