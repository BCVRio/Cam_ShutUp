#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GrassField.generated.h"

class UHierarchicalInstancedStaticMeshComponent;

// Grass clumps scattered over a surface actor (the Green): one instanced component, placed by line traces so the
// clumps sit on the real ground. build_green.py spawns one and calls Scatter; the instances save with the level.
UCLASS()
class NUNHEADGTA_API AGrassField : public AActor
{
	GENERATED_BODY()
public:
	AGrassField();
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Grass") UHierarchicalInstancedStaticMeshComponent* Grass;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") float Density = 0.6f;      // clumps per square metre
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") float ScaleMin = 0.8f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") float ScaleMax = 1.5f;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") float MaxSlope = 0.7f;      // skip hits whose normal.Z is below this
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") int32 Seed = 7;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") float CullStart = 3500.f;   // cm: instances fade out between these
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") float CullEnd = 9000.f;
	// a rectangle kept clear (the pitch): world centre and half extents in cm, zero extents = nothing cleared
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") FVector ClearCentre = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Grass") FVector2D ClearHalfExtent = FVector2D::ZeroVector;
	// Drops clumps over Surface's bounds wherever a downward trace lands on Surface itself. Returns how many were placed.
	UFUNCTION(BlueprintCallable, CallInEditor, Category="Grass") int32 Scatter(AActor* Surface, UStaticMesh* ClumpMesh);
};
